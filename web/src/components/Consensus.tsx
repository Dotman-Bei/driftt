"use client";

import type { Consensus } from "@/lib/types";
import { GenLayerMark } from "./ui";

/**
 * "The system is thinking." A slow cobalt pulse — not a spinner, not a progress
 * bar. It conveys autonomous machine action happening off-screen. This is the
 * visual signature of the whole product, and one of the page's cobalt uses.
 */
export function ThinkingPulse({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-5 py-10">
      <div className="h-16 w-px bg-[#110FFF] driftt-pulse" />
      <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] text-center">
        {label}
      </p>
    </div>
  );
}

/**
 * The payoff. Terse, machine-voiced, no celebration copy. Success green appears
 * here and essentially nowhere else — it should feel like a small, earned flash
 * of light against the void.
 */
export function ConsensusResult({ consensus }: { consensus: Consensus }) {
  const { approved, agreedCount, totalCount, votes, principle, appealed } = consensus;

  return (
    <div className="driftt-fade-up">
      <p
        className="font-mono text-xs tracking-[0.2em] uppercase mb-8 text-center"
        style={{
          color: approved ? "#00FF66" : "#FF2B2B",
          textShadow: approved ? "0 0 20px rgba(0, 255, 102, 0.4)" : "none",
        }}
      >
        {approved
          ? `${agreedCount} of ${totalCount} validators agreed — balance approved`
          : `Rejected — only ${agreedCount} of ${totalCount} validators agreed`}
      </p>

      {appealed && (
        <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-8 text-center">
          A validator produced an out-of-tolerance result. Appeal escalated to a larger
          validator set, and the outlier was outvoted.
        </p>
      )}

      <div className="border border-[#303030]">
        <div className="px-5 py-3 border-b border-[#303030]">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-2">
            Equivalence principle
          </p>
          <p className="text-[#CACACA] text-sm leading-relaxed">{principle}</p>
        </div>

        {votes.map((vote) => (
          <div
            key={vote.validator}
            className="px-5 py-4 border-b border-[#303030] last:border-b-0 flex gap-4 items-start"
          >
            <span
              className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: vote.agreed ? "#00FF66" : "#FF2B2B" }}
            />
            <div className="min-w-0">
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-1">
                {vote.validator} · {vote.role}
              </p>
              <p
                className="text-sm leading-relaxed"
                style={{ color: vote.agreed ? "#CACACA" : "#FF2B2B" }}
              >
                {vote.note}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 flex justify-center">
        <GenLayerMark />
      </div>
    </div>
  );
}
