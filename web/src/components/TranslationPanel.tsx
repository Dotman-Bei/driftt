"use client";

import type { Consensus, Item, Translation } from "@/lib/types";
import { GAME_NAMES, STAT_KEYS } from "@/lib/rulesets";
import type { GameId } from "@/lib/types";
import { ConsensusResult, ThinkingPulse } from "./Consensus";
import { ItemSigil } from "./ItemCard";
import { PowerBar, RarityBadge } from "./ui";

export type Phase = "idle" | "translating" | "reviewing" | "done" | "failed";

/**
 * The showpiece.
 *
 * Left: the item as it exists in its origin game. Right: the item as translated
 * into the target game. Between them, a single Graphite hairline — and while
 * consensus runs, that hairline is where the cobalt pulse lives. Whitespace
 * carries it.
 */
export function TranslationPanel({
  item,
  targetGame,
  phase,
  translation,
  consensus,
  onChain,
  txId,
  error,
}: {
  item: Item;
  targetGame: GameId;
  phase: Phase;
  translation?: Translation;
  consensus?: Consensus;
  onChain?: boolean;
  txId?: string;
  error?: string;
}) {
  const running = phase === "translating" || phase === "reviewing";

  return (
    <div>
      <div className="grid md:grid-cols-[1fr_1px_1fr] gap-10 md:gap-0">
        {/* ORIGIN --------------------------------------------------------- */}
        <div className="md:pr-12">
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] mb-6">
            {GAME_NAMES[item.originGame]} · origin
          </p>

          <ItemSigil item={item} size={120} />

          <h3 className="text-2xl font-bold text-[#F5F5F5] tracking-tight mt-6 mb-3">
            {item.canonicalName}
          </h3>
          <div className="mb-6">
            <RarityBadge rarity={item.rarity} />
          </div>

          <div className="mb-8">
            <PowerBar power={item.powerTier} />
          </div>

          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-3">
            What it is
          </p>
          <p className="text-[#CACACA] text-sm leading-relaxed mb-8">
            {item.semanticDescriptor}
          </p>

          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-3">
            Lore
          </p>
          <p className="text-[#CACACA] text-sm leading-relaxed whitespace-pre-line">
            {item.lore}
          </p>
        </div>

        {/* THE HAIRLINE — where the pulse lives --------------------------- */}
        <div className="hidden md:block relative">
          <div className="absolute inset-0 w-px bg-[#303030]" />
          {running && (
            <div className="absolute inset-0 w-px bg-[#110FFF] driftt-pulse" />
          )}
        </div>

        {/* TARGET --------------------------------------------------------- */}
        <div className="md:pl-12">
          <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] mb-6">
            {GAME_NAMES[targetGame]} · translated
          </p>

          {phase === "idle" && (
            <p className="text-[#606060] text-sm leading-relaxed">
              Nothing here yet. Request a translation and the validators will decide what
              this item becomes in {GAME_NAMES[targetGame]}.
            </p>
          )}

          {running && (
            <ThinkingPulse
              label={
                phase === "translating"
                  ? "Leader validator is reasoning about the item"
                  : "Validators are independently re-running the translation"
              }
            />
          )}

          {phase === "failed" && (
            <p className="text-[#FF2B2B] text-sm leading-relaxed">
              {error ?? "The translation was rejected."}
            </p>
          )}

          {phase === "done" && translation && (
            <div className="driftt-fade-up">
              <h3 className="text-2xl font-bold text-[#F5F5F5] tracking-tight mb-6">
                {translation.translatedName}
              </h3>

              <div className="mb-8">
                <PowerBar power={translation.powerTier} />
                <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-3">
                  Origin tier {translation.originPowerTier} · drift{" "}
                  {translation.powerTier >= translation.originPowerTier ? "+" : ""}
                  {translation.powerTier - translation.originPowerTier}
                </p>
              </div>

              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-3">
                {GAME_NAMES[targetGame]} stats
              </p>
              <dl className="mb-8 border-t border-[#303030]">
                {STAT_KEYS[targetGame].map((key) => (
                  <div
                    key={key}
                    className="flex justify-between py-3 border-b border-[#303030]"
                  >
                    <dt className="font-mono text-xs tracking-[0.15em] uppercase text-[#606060]">
                      {key}
                    </dt>
                    <dd className="font-mono text-sm text-[#F5F5F5]">
                      {String(translation.translatedStats[key] ?? "—")}
                    </dd>
                  </div>
                ))}
              </dl>

              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-3">
                Adapted lore
              </p>
              <p className="text-[#CACACA] text-sm leading-relaxed mb-8">
                {translation.adaptedLore}
              </p>

              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-3">
                Why this is fair
              </p>
              <p className="text-[#CACACA] text-sm leading-relaxed">
                {translation.balanceJustification}
              </p>
            </div>
          )}
        </div>
      </div>

      {consensus && (phase === "done" || phase === "failed") && (
        <div className="mt-20 max-w-3xl mx-auto">
          <ConsensusResult consensus={consensus} onChain={onChain} txId={txId} />
        </div>
      )}
    </div>
  );
}
