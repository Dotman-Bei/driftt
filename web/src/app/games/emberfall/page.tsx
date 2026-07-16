"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CONTRACTS_DEPLOYED,
  ensureAddress,
  playableIn,
  recordChainForge,
  recordForge,
  useDriftt,
} from "@/lib/store";
import type { Consensus, Item } from "@/lib/types";

interface ForgeResponse {
  item: Item;
  consensus: Consensus;
  error?: string;
  usingChain?: boolean;
  txId?: string;
}
import {
  Emberfall,
  STARTER,
  weaponFromNative,
  weaponFromTranslation,
  type EquippedWeapon,
} from "@/components/games/Emberfall";
import { ConsensusResult, ThinkingPulse } from "@/components/Consensus";
import { ItemCard } from "@/components/ItemCard";
import { Eyebrow, Headline, Section } from "@/components/ui";

export default function EmberfallPage() {
  const state = useDriftt();
  const { native, imported } = playableIn(state, "emberfall");

  const [equipped, setEquipped] = useState<EquippedWeapon>(STARTER);
  const [forging, setForging] = useState(false);
  const [onChain, setOnChain] = useState(false);
  const [txId, setTxId] = useState<string | undefined>();
  const [forged, setForged] = useState<Item | null>(null);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const forgeRef = useRef<HTMLDivElement>(null);

  // The forge status renders below the game canvas, so a win would otherwise
  // leave the reward off-screen behind the victory overlay. Bring it into view
  // the moment forging starts, and again when the item lands.
  useEffect(() => {
    if (forging || forged || error) {
      forgeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [forging, forged, error]);

  const onVictory = useCallback(
    async (eventContext: string) => {
      setForging(true);
      setForged(null);
      setConsensus(null);
      setError(null);
      setOnChain(CONTRACTS_DEPLOYED); // optimistic; corrected from the response

      const owner = ensureAddress();

      try {
        const res = await fetch("/api/forge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: "emberfall", eventContext, player: owner }),
        });
        const data = (await res.json()) as ForgeResponse;
        if (!res.ok) throw new Error(data.error ?? "the forge failed");

        setOnChain(Boolean(data.usingChain));
        setTxId(data.txId);
        setConsensus(data.consensus);
        if (data.consensus.approved) {
          // On-chain, the item already carries its real registry id and owner;
          // keep it verbatim so a later translation reads the right id.
          setForged(
            data.usingChain
              ? recordChainForge(data.item, data.consensus)
              : recordForge(owner, data.item, data.consensus),
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "the forge failed");
      } finally {
        setForging(false);
      }
    },
    [],
  );

  return (
    <>
      <Section className="border-t-0">
        <Eyebrow>Emberfall · fantasy dungeon crawler</Eyebrow>
        <Headline className="max-w-3xl">Kill the thing at the end of the room.</Headline>
        <p className="text-[#CACACA] text-lg leading-relaxed max-w-2xl mb-12">
          Clear the vault and the forge decides what you earned. Nothing is minted by
          hand — the item is designed from what you actually did.
        </p>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 lg:gap-12 items-start">
          <Emberfall weapon={equipped} onVictory={onVictory} />

          <aside>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-6">
              Equipped
            </p>

            <div className="border border-[#303030] p-5 mb-8">
              <p className="text-[#F5F5F5] mb-4">{equipped.name}</p>
              <dl className="border-t border-[#303030]">
                {[
                  ["ATK", equipped.atk],
                  ["ELEMENT", equipped.element],
                  ["DURABILITY", equipped.durability],
                ].map(([k, v]) => (
                  <div
                    key={String(k)}
                    className="flex justify-between py-2 border-b border-[#303030] last:border-b-0"
                  >
                    <dt className="font-mono text-[10px] tracking-[0.15em] uppercase text-[#606060]">
                      {k}
                    </dt>
                    <dd className="font-mono text-xs text-[#CACACA]">{String(v)}</dd>
                  </div>
                ))}
              </dl>
              {equipped.imported && (
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-4">
                  Translated in from Nova Drift
                </p>
              )}
            </div>

            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
              Armoury
            </p>
            <div className="space-y-px">
              <button
                onClick={() => setEquipped(STARTER)}
                className="w-full text-left border border-[#303030] p-4 transition-all duration-200 hover:border-[#110FFF]"
              >
                <p className="text-[#CACACA] text-sm">{STARTER.name}</p>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-1">
                  ATK {STARTER.atk} · starting sword
                </p>
              </button>

              {native.map((item) => (
                <button
                  key={item.itemId}
                  onClick={() => setEquipped(weaponFromNative(item))}
                  className="w-full text-left border border-[#303030] p-4 transition-all duration-200 hover:border-[#110FFF]"
                >
                  <p className="text-[#CACACA] text-sm">{item.canonicalName}</p>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-1">
                    Tier {item.powerTier} · {item.rarity} · native
                  </p>
                </button>
              ))}

              {imported.map(({ translation, item }) => (
                <button
                  key={`${item.itemId}-t`}
                  onClick={() => setEquipped(weaponFromTranslation(translation))}
                  className="w-full text-left border border-[#303030] p-4 transition-all duration-200 hover:border-[#110FFF]"
                >
                  <p className="text-[#CACACA] text-sm">{translation.translatedName}</p>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-1">
                    Tier {translation.powerTier} · translated from Nova Drift
                  </p>
                </button>
              ))}
            </div>
          </aside>
        </div>
      </Section>

      {(forging || consensus || error) && (
        <div ref={forgeRef}>
        <Section>
          <Eyebrow>The forge</Eyebrow>

          {forging && (
            <ThinkingPulse
              label={
                onChain
                  ? "Forging on GenLayer — validators are running the LLM and reaching consensus (~1 min)"
                  : "An Intelligent Contract is designing your reward"
              }
            />
          )}

          {error && <p className="font-mono text-sm text-[#FF2B2B]">{error}</p>}

          {forged && !forging && (
            <div className="mb-16 max-w-2xl driftt-fade-up">
              <Headline>{forged.canonicalName}</Headline>
              <div className="mt-8">
                <ItemCard item={forged} />
              </div>
              <p className="text-[#CACACA] text-sm leading-relaxed mt-8">
                It is yours, and it is portable.{" "}
                <Link
                  href={`/translate/${forged.itemId}`}
                  className="text-[#F5F5F5] underline underline-offset-4 decoration-[#303030] hover:decoration-[#110FFF] transition-colors duration-200"
                >
                  Translate it into Nova Drift
                </Link>{" "}
                and watch the validators rebalance it for a world that has never heard of
                swords.
              </p>
            </div>
          )}

          {consensus && !forging && (
            <div className="max-w-3xl">
              <ConsensusResult consensus={consensus} onChain={onChain} txId={txId} />
            </div>
          )}
        </Section>
        </div>
      )}
    </>
  );
}
