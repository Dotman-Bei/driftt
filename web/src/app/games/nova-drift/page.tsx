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
  NovaDrift,
  STOCK,
  loadoutFromNative,
  loadoutFromTranslation,
  type Loadout,
} from "@/components/games/NovaDrift";
import { ConsensusResult, ThinkingPulse } from "@/components/Consensus";
import { ItemCard } from "@/components/ItemCard";
import { ButtonLink, Eyebrow, Headline, Section } from "@/components/ui";

export default function NovaDriftPage() {
  const state = useDriftt();
  const { native, imported } = playableIn(state, "nova-drift");

  const [loadout, setLoadout] = useState<Loadout>(STOCK);
  const [forging, setForging] = useState(false);
  const [onChain, setOnChain] = useState(false);
  const [forged, setForged] = useState<Item | null>(null);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const forgeRef = useRef<HTMLDivElement>(null);

  // Bring the forge status into view on a win — it renders below the game canvas,
  // so otherwise the reward sits off-screen behind the victory overlay.
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
          body: JSON.stringify({ gameId: "nova-drift", eventContext, player: owner }),
        });
        const data = (await res.json()) as ForgeResponse;
        if (!res.ok) throw new Error(data.error ?? "the forge failed");

        setOnChain(Boolean(data.usingChain));
        setConsensus(data.consensus);
        if (data.consensus.approved) {
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
        <Eyebrow>Nova Drift · sci-fi twin-stick shooter</Eyebrow>
        <Headline className="max-w-3xl">Fire the sword.</Headline>
        <p className="text-[#CACACA] text-lg leading-relaxed max-w-2xl mb-12">
          {imported.length > 0
            ? "Your imported weapon is in the rack. Every stat on it was written by the translation engine and approved by validators — including the overheat risk it inherited from being fragile in a world that no longer exists."
            : "Nothing has drifted in yet. Forge something in Emberfall, translate it, and it will show up here as ordnance."}
        </p>

        <div className="grid lg:grid-cols-[1fr_320px] gap-8 lg:gap-12 items-start">
          <NovaDrift loadout={loadout} onVictory={onVictory} />

          <aside>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-6">
              Equipped
            </p>

            <div
              className="border p-5 mb-8"
              style={{ borderColor: loadout.imported ? "#110FFF" : "#303030" }}
            >
              <p className="text-[#F5F5F5] mb-4">{loadout.name}</p>
              <dl className="border-t border-[#303030]">
                {[
                  ["DAMAGE", loadout.damage],
                  ["SHIELD", loadout.shield],
                  ["FIRE_RATE", loadout.fireRate],
                  ["ENERGY_TYPE", loadout.energyType],
                  ["OVERHEAT_RISK", loadout.overheatRisk],
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
              {loadout.imported && (
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-4">
                  Translated in from Emberfall
                </p>
              )}
            </div>

            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
              Weapon rack
            </p>
            <div className="space-y-px">
              <button
                onClick={() => setLoadout(STOCK)}
                className="w-full text-left border border-[#303030] p-4 transition-all duration-200 hover:border-[#110FFF]"
              >
                <p className="text-[#CACACA] text-sm">{STOCK.name}</p>
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-1">
                  DMG {STOCK.damage} · stock
                </p>
              </button>

              {native.map((item) => (
                <button
                  key={item.itemId}
                  onClick={() => setLoadout(loadoutFromNative(item))}
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
                  onClick={() => setLoadout(loadoutFromTranslation(translation))}
                  className="w-full text-left border border-[#110FFF] p-4 transition-all duration-200 hover:scale-[0.98]"
                >
                  <p className="text-[#F5F5F5] text-sm">{translation.translatedName}</p>
                  <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-1">
                    DMG {String(translation.translatedStats.DAMAGE ?? "—")} · overheat{" "}
                    {String(translation.translatedStats.OVERHEAT_RISK ?? "—")} · from{" "}
                    {item.canonicalName}
                  </p>
                </button>
              ))}
            </div>

            {imported.length === 0 && (
              <div className="mt-8">
                <ButtonLink href="/inventory" variant="secondary">
                  Find something to import
                </ButtonLink>
              </div>
            )}
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
                Forged here, but not bound here.{" "}
                <Link
                  href={`/translate/${forged.itemId}`}
                  className="text-[#F5F5F5] underline underline-offset-4 decoration-[#303030] hover:decoration-[#110FFF] transition-colors duration-200"
                >
                  Translate it into Emberfall
                </Link>{" "}
                and it becomes a melee weapon in a world with no reactors.
              </p>
            </div>
          )}

          {consensus && !forging && (
            <div className="max-w-3xl">
              <ConsensusResult consensus={consensus} />
            </div>
          )}
        </Section>
        </div>
      )}
    </>
  );
}
