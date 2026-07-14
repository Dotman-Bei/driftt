/*
  Shared plumbing for talking to Driftt's deployed Intelligent Contracts.

  Two things here are load-bearing and were both learned the hard way against the
  live chain:

  1. ADDRESSES MUST BE WRAPPED. Passing a "0x..." string as an argument to a
     contract method that declares `Address` encodes it as a *string* in calldata.
     The contract then receives a str where it expects an Address, and the whole
     transaction dies inside the GenVM. Wrap every address in CalldataAddress.

  2. CONSENSUS SUCCEEDING IS NOT THE SAME AS THE CONTRACT SUCCEEDING. A
     transaction can reach ACCEPTED/FINALIZED with result AGREE — the validators
     unanimously agreeing — while the contract body itself threw. That shows up
     only in `txExecutionResult`, as FINISHED_WITH_ERROR. Anything that checks the
     consensus status alone will happily report success on a contract that failed.
*/

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createAccount, createClient } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { CalldataAddress, TransactionStatus } from "genlayer-js/types";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "..", "..");
export const CONTRACTS_DIR = resolve(ROOT, "contracts");

/** Wrap a 0x-hex address so the GenVM sees an Address, not a string. */
export function addr(hex) {
  return new CalldataAddress(Uint8Array.from(Buffer.from(hex.slice(2), "hex")));
}

export function loadDeployments() {
  return JSON.parse(
    readFileSync(resolve(CONTRACTS_DIR, "deployments.json"), "utf8"),
  );
}

export function makeClient() {
  const key = readFileSync(resolve(ROOT, ".env"), "utf8").match(
    /GENLAYER_PRIVATE_KEY=(.+)/,
  )[1].trim();
  const account = createAccount(key);
  return { account, client: createClient({ chain: testnetBradbury, account }) };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const WAIT = { status: TransactionStatus.ACCEPTED, interval: 4000, retries: 180 };

/** A transport hiccup, as opposed to the chain actually rejecting something. */
function isNetworkBlip(err) {
  const s = `${err?.message ?? ""} ${err?.details ?? ""} ${err?.cause?.message ?? ""}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|socket hang up|SSL|EAI_AGAIN|network/i.test(s);
}

/**
 * Wait for a receipt, surviving transport failures.
 *
 * The public RPC intermittently drops connections and even throws SSL alerts
 * mid-poll. The transaction is already on the chain at that point — losing the
 * connection while watching it is not a reason to give up on it, so keep polling
 * the same hash rather than resubmitting (which would deploy a second contract).
 */
export async function waitForReceipt(client, hash, attempts = 10) {
  for (let i = 1; i <= attempts; i++) {
    try {
      return await client.waitForTransactionReceipt({ hash, ...WAIT });
    } catch (err) {
      if (!isNetworkBlip(err) || i === attempts) throw err;
      process.stdout.write("~");
      await sleep(6000);
    }
  }
}

/** A transient consensus failure (no leader / validators available) — resubmit gets a fresh set. */
class TimeoutError extends Error {}

/**
 * Throw unless the transaction reached consensus AND the contract body succeeded.
 *
 * Distinguishes three outcomes:
 *   · FINISHED_WITH_ERROR — the contract threw. Fatal, never retried; retrying
 *     would just bury a real bug.
 *   · LEADER_TIMEOUT / VALIDATORS_TIMEOUT — no validator set formed. Transient;
 *     a resubmit draws a fresh leader, so this is retryable.
 *   · anything not accepted/finalized — genuinely unexpected. Fatal.
 */
export function assertExecuted(receipt, what) {
  const exec = receipt?.txExecutionResultName ?? receipt?.txExecutionResult;
  if (exec === "FINISHED_WITH_ERROR" || exec === 2) {
    throw new Error(
      `${what}: validators agreed, but the contract threw (FINISHED_WITH_ERROR)`,
    );
  }
  const consensus = receipt?.statusName ?? receipt?.status;
  if (["LEADER_TIMEOUT", "VALIDATORS_TIMEOUT", 12, 13].includes(consensus)) {
    throw new TimeoutError(`${what}: consensus timed out (${consensus})`);
  }
  if (!["ACCEPTED", "FINALIZED", 5, 7].includes(consensus)) {
    throw new Error(`${what}: no consensus (status ${consensus})`);
  }
  return receipt;
}

const isRetryable = (err) => err instanceof TimeoutError;

/**
 * Send a write and wait for it. Retries on revert, because the consensus contract
 * rejects a second write to a contract while the previous one is still settling.
 */
export async function send(client, { address, functionName, args }, attempts = 5) {
  for (let i = 1; i <= attempts; i++) {
    let hash;
    try {
      hash = await client.writeContract({ address, functionName, args, value: 0n });
    } catch (err) {
      // The submission itself was rejected — most often the consensus contract
      // refusing a write while a previous one to the same contract still settles.
      // Nothing has run yet, so re-submitting is safe. Back off and retry.
      if (i === attempts) throw err;
      process.stdout.write(`(resubmit ${i}) `);
      await sleep(12000 * i);
      continue;
    }

    // Past this point the transaction is ON THE CHAIN. A lost connection while
    // waiting for its receipt is NOT a reason to re-submit — that would run the
    // intelligent method (and burn gas) a second time. waitForReceipt polls the
    // same hash through transport failures instead.
    const receipt = await waitForReceipt(client, hash);
    try {
      assertExecuted(receipt, functionName); // FINISHED_WITH_ERROR throws, no retry
    } catch (err) {
      // A consensus timeout means no set formed — resubmitting draws a fresh one.
      if (isRetryable(err) && i < attempts) {
        process.stdout.write(`(timeout, resubmit ${i}) `);
        await sleep(10000);
        continue;
      }
      throw err;
    }
    await sleep(12000); // let it settle before touching the same contract again
    return receipt;
  }
}

export async function deployContract(client, file, args, attempts = 4) {
  const code = readFileSync(resolve(CONTRACTS_DIR, file));
  for (let i = 1; i <= attempts; i++) {
    const hash = await client.deployContract({ code, args });
    const receipt = await waitForReceipt(client, hash);
    try {
      assertExecuted(receipt, file);
    } catch (err) {
      // A deploy that timed out committed nothing — safe to redeploy with a
      // fresh validator set.
      if (isRetryable(err) && i < attempts) {
        process.stdout.write(`(timeout, redeploy ${i}) `);
        await sleep(10000);
        continue;
      }
      throw err;
    }
    const address = receipt?.recipient;
    if (!address?.startsWith("0x")) throw new Error(`${file}: no address in receipt`);
    await sleep(12000);
    return address;
  }
}

/** A view call. Proves the contract exists — a dead address throws "contract not found". */
export function read(client, address, functionName, args = []) {
  return client.readContract({ address, functionName, args });
}
