"use client";

import { useState } from "react";
import Link from "next/link";
import {
  itemById,
  recordTranslation,
  translationFor,
  useDriftt,
} from "@/lib/store";
import { GAME_NAMES, otherGame } from "@/lib/rulesets";
import type { Consensus, TranslateResult, Translation } from "@/lib/types";
import { TranslationPanel, type Phase } from "@/components/TranslationPanel";
import { Button, ButtonLink, Eyebrow, Headline, Section } from "@/components/ui";

export function TranslateFlow({ itemId }: { itemId: number }) {
  const state = useDriftt();
  const item = itemById(state, itemId);
  const target = item ? otherGame(item.originGame) : "nova-drift";
  const existing = item ? translationFor(state, itemId, target) : undefined;

  const [phase, setPhase] = useState<Phase>("idle");
  const [translation, setTranslation] = useState<Translation | undefined>();
  const [consensus, setConsensus] = useState<Consensus | undefined>();
  const [onChain, setOnChain] = useState(false);
  const [txId, setTxId] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

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

  const shown = translation ?? existing;
  const effectivePhase: Phase =
    phase === "idle" && existing ? "done" : phase;

  async function run() {
    if (!item) return;
    setPhase("translating");
    setError(undefined);
    setConsensus(undefined);

    // The leader proposes first; the other validators then re-run it. The UI
    // walks the same two beats so the consensus is legible rather than a spinner.
    const toReviewing = setTimeout(() => setPhase("reviewing"), 1400);

    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, targetGame: target }),
      });
      const data = (await res.json()) as TranslateResult & {
        error?: string;
        usingChain?: boolean;
        txId?: string;
      };
      clearTimeout(toReviewing);

      if (!res.ok) throw new Error(data.error ?? "translation failed");

      setOnChain(Boolean(data.usingChain));
      setTxId(data.txId);
      setConsensus(data.consensus);

      if (data.consensus.approved) {
        setTranslation(data.translation);
        recordTranslation(data.translation, data.consensus);
        setPhase("done");
      } else {
        setError(
          "The validators could not agree the translation was balanced. Nothing was committed.",
        );
        setPhase("failed");
      }
    } catch (err) {
      clearTimeout(toReviewing);
      setError(err instanceof Error ? err.message : "translation failed");
      setPhase("failed");
    }
  }

  const running = phase === "translating" || phase === "reviewing";

  return (
    <Section className="border-t-0">
      <Link
        href={`/inventory/${item.itemId}`}
        className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] hover:text-[#CACACA] transition-colors duration-200"
      >
        ← {item.canonicalName}
      </Link>

      <div className="mt-12 mb-20">
        <Eyebrow>Cross-game translation</Eyebrow>
        <Headline className="max-w-3xl">
          {GAME_NAMES[item.originGame]} → {GAME_NAMES[target]}
        </Headline>
        <p className="text-[#CACACA] text-lg leading-relaxed max-w-2xl mb-10">
          {existing
            ? `This item has already been translated and approved. ${GAME_NAMES[target]} can render it.`
            : `An Intelligent Contract will read what this item is and rebalance it for ${GAME_NAMES[target]}. It cannot come out stronger than it went in.`}
        </p>

        {!existing && effectivePhase !== "done" && (
          <Button onClick={run} disabled={running}>
            {running ? "Consensus running" : `Request translation`}
          </Button>
        )}

        {(existing || effectivePhase === "done") && (
          <ButtonLink href={`/games/${target}`}>Equip in {GAME_NAMES[target]}</ButtonLink>
        )}
      </div>

      <TranslationPanel
        item={item}
        targetGame={target}
        phase={effectivePhase}
        translation={shown}
        consensus={consensus}
        onChain={onChain}
        txId={txId}
        error={error}
      />
    </Section>
  );
}
