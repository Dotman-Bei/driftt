"use client";

import Link from "next/link";
import type { ActivityEntry } from "@/lib/store";
import type { ProvenanceEntry } from "@/lib/types";
import { GAME_NAMES } from "@/lib/rulesets";

/** Live stream of items being auto-generated from gameplay. Mono log lines. */
export function ForgeFeed({ activity }: { activity: ActivityEntry[] }) {
  if (activity.length === 0) {
    return (
      <p className="font-mono text-sm text-[#606060]">
        No activity yet. Play Emberfall and kill something worth killing.
      </p>
    );
  }

  return (
    <div className="border-t border-[#303030]">
      {activity.map((entry, i) => (
        <Link
          key={`${entry.itemId}-${entry.at}-${i}`}
          href={`/inventory/${entry.itemId}`}
          className="flex items-baseline gap-3 sm:gap-4 py-4 border-b border-[#303030] font-mono text-sm transition-colors duration-200 hover:bg-[#141414]"
        >
          <span className="text-[#606060] shrink-0 text-xs">
            {new Date(entry.at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </span>
          {/* The verb is repeated in the sentence, so on phones the column is
              dropped to give the item name its room. */}
          <span className="hidden sm:inline text-[#606060] shrink-0 text-xs w-24 tracking-[0.15em] uppercase">
            {entry.kind}
          </span>
          <span className="text-[#CACACA] min-w-0 truncate">
            {entry.owner.slice(0, 6)}…{entry.owner.slice(-4)}{" "}
            {entry.kind === "forged"
              ? "forged"
              : entry.kind === "translated"
                ? "carried"
                : "evolved"}{" "}
            <span className="text-[#F5F5F5]">[{entry.name}]</span>{" "}
            {entry.kind === "translated" ? "into" : "in"} {GAME_NAMES[entry.game]}
          </span>
          <span className="text-[#606060] ml-auto shrink-0 text-xs">
            {entry.powerTier}
          </span>
        </Link>
      ))}
    </div>
  );
}

/** One item, every game it has passed through, in order. Provenance is the asset. */
export function EvolutionTimeline({ entries }: { entries: ProvenanceEntry[] }) {
  return (
    <ol className="relative">
      {entries.map((entry, i) => {
        const last = i === entries.length - 1;
        return (
          <li key={`${entry.at}-${i}`} className="relative pl-8 pb-10 last:pb-0">
            {!last && (
              <span className="absolute left-[3px] top-3 bottom-0 w-px bg-[#303030]" />
            )}
            <span
              className="absolute left-0 top-2 h-1.5 w-1.5 rounded-full"
              style={{
                background: entry.kind === "translated" ? "#110FFF" : "#606060",
              }}
            />

            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-2">
              {entry.kind === "forged" && `Forged in ${GAME_NAMES[entry.game]}`}
              {entry.kind === "translated" &&
                `Translated ${entry.fromGame ? `${GAME_NAMES[entry.fromGame]} → ` : ""}${GAME_NAMES[entry.game]}`}
              {entry.kind === "evolved" && `Evolved in ${GAME_NAMES[entry.game]}`}
              {" · tier "}
              {entry.powerTier}
            </p>

            <p className="text-[#F5F5F5] mb-2">{entry.name}</p>
            <p className="text-[#CACACA] text-sm leading-relaxed">{entry.note}</p>
          </li>
        );
      })}
    </ol>
  );
}
