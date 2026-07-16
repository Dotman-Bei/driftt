"use client";

import { useState } from "react";
import Link from "next/link";
import { itemById, recordEvolution, useDriftt } from "@/lib/store";
import { GAME_NAMES, otherGame } from "@/lib/rulesets";
import type { Consensus, EvolveResult } from "@/lib/types";
import { EvolutionTimeline } from "@/components/Feeds";
import { ConsensusResult, ThinkingPulse } from "@/components/Consensus";
import { ItemSigil } from "@/components/ItemCard";
import {
  Button,
  ButtonLink,
  Eyebrow,
  Headline,
  PowerBar,
  RarityBadge,
  Section,
} from "@/components/ui";

export function ItemDetail({ itemId }: { itemId: number }) {
  const state = useDriftt();
  const item = itemById(state, itemId);

  const [usageEvent, setUsageEvent] = useState("");
  const [evolving, setEvolving] = useState(false);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!item) {
    return (
      <Section className="border-t-0">
        <Eyebrow>Not found</Eyebrow>
        <Headline>No item with that id.</Headline>
        <ButtonLink href="/inventory" variant="secondary">
          Back to inventory
        </ButtonLink>
      </Section>
    );
  }

  const target = otherGame(item.originGame);
  const translated = state.translations.some(
    (t) => t.itemId === item.itemId && t.targetGame === target,
  );
  const history = state.provenance[item.itemId] ?? [];
  const timesEvolved = state.timesEvolved[item.itemId] ?? 0;

  async function runEvolve() {
    if (!item || usageEvent.trim().length < 10) return;
    setEvolving(true);
    setConsensus(null);
    setError(null);

    try {
      const res = await fetch("/api/evolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, usageEvent, timesEvolved }),
      });
      const data = (await res.json()) as EvolveResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "evolution failed");

      setConsensus(data.consensus);
      if (data.consensus.approved) {
        recordEvolution(item, data, usageEvent);
        setUsageEvent("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "evolution failed");
    } finally {
      setEvolving(false);
    }
  }

  return (
    <>
      <Section className="border-t-0">
        <Link
          href="/inventory"
          className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] hover:text-[#CACACA] transition-colors duration-200"
        >
          ← Inventory
        </Link>

        <div className="grid md:grid-cols-[auto_1fr] gap-8 md:gap-12 mt-10 md:mt-12 items-start">
          <ItemSigil item={item} size={180} />

          <div>
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] mb-6">
              Forged in {GAME_NAMES[item.originGame]}
            </p>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#F5F5F5] tracking-tight leading-tight mb-6 break-words">
              {item.canonicalName}
            </h1>

            <div className="mb-8">
              <RarityBadge rarity={item.rarity} />
            </div>

            <div className="max-w-md mb-10">
              <PowerBar power={item.powerTier} />
            </div>

            <div className="flex flex-wrap gap-4">
              {translated ? (
                <ButtonLink href={`/games/${target}`}>
                  Equip in {GAME_NAMES[target]}
                </ButtonLink>
              ) : (
                <ButtonLink href={`/translate/${item.itemId}`}>
                  Translate to {GAME_NAMES[target]}
                </ButtonLink>
              )}
            </div>
          </div>
        </div>
      </Section>

      <Section>
        <Eyebrow>What it is</Eyebrow>
        <p className="text-[#CACACA] text-lg leading-relaxed max-w-3xl mb-16">
          {item.semanticDescriptor}
        </p>

        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
          This is the only thing that travels
        </p>
        <p className="text-[#CACACA] text-sm leading-relaxed max-w-2xl">
          No numbers, no stat names. When {GAME_NAMES[target]} imports this item, it
          reasons from the description above — not from Emberfall&apos;s stat block, which
          would mean nothing to it.
        </p>
      </Section>

      <Section>
        <Eyebrow>Lore</Eyebrow>
        <p className="text-[#CACACA] text-lg leading-relaxed max-w-3xl whitespace-pre-line">
          {item.lore}
        </p>
      </Section>

      <Section>
        <Eyebrow>Provenance</Eyebrow>
        <Headline className="max-w-3xl">
          One item. Every world it has passed through.
        </Headline>
        <div className="mt-16 max-w-3xl">
          <EvolutionTimeline entries={history} />
        </div>
      </Section>

      <Section>
        <Eyebrow>Evolution</Eyebrow>
        <Headline className="max-w-3xl">Use it, and it changes.</Headline>
        <p className="text-[#CACACA] text-lg leading-relaxed max-w-2xl mb-4">
          Describe how the item was used. Validators decide what that did to it — and the
          gain is capped hard, so it cannot be farmed into a god-weapon.
        </p>
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-10">
          Evolved {timesEvolved} time{timesEvolved === 1 ? "" : "s"} ·{" "}
          {Math.max(0, 6 - timesEvolved)} points of headroom left
        </p>

        <div className="max-w-2xl">
          <textarea
            value={usageEvent}
            onChange={(e) => setUsageEvent(e.target.value)}
            rows={3}
            disabled={evolving}
            placeholder="Used to destroy 100 hostiles in a single Nova Drift run without overheating."
            className="w-full bg-[#141414] border border-[#303030] p-5 text-[#CACACA] text-sm leading-relaxed placeholder:text-[#606060] focus:outline-none focus:border-[#110FFF] transition-colors duration-200 resize-none"
          />

          <div className="mt-6">
            <Button
              onClick={runEvolve}
              disabled={evolving || usageEvent.trim().length < 10}
            >
              {evolving ? "Validators reviewing" : "Submit for evolution"}
            </Button>
          </div>

          {evolving && <ThinkingPulse label="Validators are judging what this event earned" />}

          {error && (
            <p className="mt-8 font-mono text-sm text-[#FF2B2B]">{error}</p>
          )}

          {consensus && !evolving && (
            <div className="mt-12">
              <ConsensusResult consensus={consensus} />
            </div>
          )}
        </div>
      </Section>
    </>
  );
}
