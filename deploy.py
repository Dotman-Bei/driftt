"""
Deploy Driftt's Intelligent Contracts to GenLayer.

    python deploy.py --chain testnet-asimov     # Testnet Asimov (default)
    python deploy.py --chain studionet          # GenLayer Studio
    python deploy.py --chain localnet           # local node

Requires GENLAYER_PRIVATE_KEY in the environment (or a .env beside this file).
On success it writes contracts/deployments.json and web/.env.local, so the
frontend switches from simulated consensus to the live chain with no code change.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from genlayer_py import create_account, create_client
from genlayer_py.chains import localnet, studionet, testnet_asimov
from genlayer_py.types import CalldataAddress, TransactionStatus

from contracts.rulesets import RULESETS

ROOT = Path(__file__).parent
CONTRACTS = ROOT / "contracts"

CHAINS = {
    "testnet-asimov": testnet_asimov,
    "studionet": studionet,
    "localnet": localnet,
}


def load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def deploy(client, account, name: str, filename: str, args: list) -> str:
    code = (CONTRACTS / filename).read_bytes()
    print(f"  deploying {name} ...", end=" ", flush=True)

    tx_hash = client.deploy_contract(code=code, account=account, args=args)
    receipt = client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, status=TransactionStatus.ACCEPTED, retries=40
    )

    address = _contract_address(receipt)
    if not address:
        print("FAILED")
        raise SystemExit(f"{name}: no contract address in receipt:\n{receipt}")

    print(address)
    return address


def _contract_address(receipt) -> str | None:
    """The receipt shape has moved around across SDK versions - probe the known spots."""
    if isinstance(receipt, dict):
        for key in ("contract_address", "contractAddress"):
            if receipt.get(key):
                return receipt[key]
        data = receipt.get("data") or {}
        if isinstance(data, dict) and data.get("contract_address"):
            return data["contract_address"]
        tx_data = receipt.get("tx_data_decoded") or {}
        if isinstance(tx_data, dict) and tx_data.get("contract_address"):
            return tx_data["contract_address"]
    return getattr(receipt, "contract_address", None)


def call(client, account, address: str, fn: str, args: list) -> None:
    print(f"  {fn}({', '.join(str(a) for a in args)[:60]}) ...", end=" ", flush=True)
    tx_hash = client.write_contract(
        address=address, function_name=fn, account=account, args=args
    )
    client.wait_for_transaction_receipt(
        transaction_hash=tx_hash, status=TransactionStatus.ACCEPTED, retries=40
    )
    print("ok")


def main() -> None:
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser()
    parser.add_argument("--chain", choices=list(CHAINS), default="testnet-asimov")
    opts = parser.parse_args()

    private_key = os.environ.get("GENLAYER_PRIVATE_KEY")
    if not private_key:
        sys.exit(
            "GENLAYER_PRIVATE_KEY is not set.\n"
            "Put it in Driftt/.env (see .env.example), or export it.\n"
            "Fund the account from the GenLayer testnet faucet before deploying."
        )

    chain = CHAINS[opts.chain]
    account = create_account(account_private_key=private_key)
    client = create_client(chain=chain, account=account)

    print(f"\nDriftt -> {chain.name}")
    print(f"deployer {account.address}\n")

    registry = deploy(client, account, "ItemRegistry", "item_registry.py", [])
    reg_arg = CalldataAddress(registry)

    forge = deploy(client, account, "ItemForge", "item_forge.py", [reg_arg])
    translator = deploy(client, account, "TranslationEngine", "translation_engine.py", [reg_arg])
    evolver = deploy(client, account, "EvolutionTracker", "evolution_tracker.py", [reg_arg])

    print("\nauthorizing the Intelligent Contracts to write to the registry")
    for addr in (forge, translator, evolver):
        call(client, account, registry, "set_authorized", [CalldataAddress(addr), True])

    print("\nregistering games")
    for game_id, ruleset in RULESETS.items():
        call(client, account, registry, "register_game", [game_id, ruleset])

    deployments = {
        "chain": opts.chain,
        "chain_id": chain.id,
        "deployer": account.address,
        "contracts": {
            "ItemRegistry": registry,
            "ItemForge": forge,
            "TranslationEngine": translator,
            "EvolutionTracker": evolver,
        },
    }
    (CONTRACTS / "deployments.json").write_text(
        json.dumps(deployments, indent=2) + "\n", encoding="utf-8"
    )

    env_local = ROOT / "web" / ".env.local"
    existing = {}
    if env_local.exists():
        for line in env_local.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip()

    existing.update(
        {
            "NEXT_PUBLIC_GENLAYER_CHAIN": opts.chain,
            "NEXT_PUBLIC_ITEM_REGISTRY": registry,
            "NEXT_PUBLIC_ITEM_FORGE": forge,
            "NEXT_PUBLIC_TRANSLATION_ENGINE": translator,
            "NEXT_PUBLIC_EVOLUTION_TRACKER": evolver,
        }
    )
    env_local.write_text(
        "\n".join(f"{k}={v}" for k, v in existing.items()) + "\n", encoding="utf-8"
    )

    print("\nwrote contracts/deployments.json and web/.env.local")
    print("the frontend will now read from the chain instead of the local simulator\n")


if __name__ == "__main__":
    main()
