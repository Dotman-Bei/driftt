"use client";

import Link from "next/link";
import type { Item } from "@/lib/types";
import { GAME_NAMES } from "@/lib/rulesets";
import { PowerBar, RarityBadge } from "./ui";

/**
 * Item artwork is generated off-chain from the forge's artwork_prompt and pinned
 * to IPFS. Until the resolver backfills the CID, we draw a deterministic sigil
 * from the item itself — which is honest (it is derived from the real item) and
 * keeps the art pipeline from ever blocking a mint.
 */
export function ItemSigil({ item, size = 120 }: { item: Item; size?: number }) {
  const n = item.canonicalName.length + item.powerTier;
  const rings = 3 + (n % 3);
  const cobalt = item.rarity === "epic" || item.rarity === "legendary";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      aria-hidden
      className="shrink-0"
    >
      {Array.from({ length: rings }).map((_, i) => {
        const r = 16 + i * (40 / rings);
        return (
          <circle
            key={i}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={cobalt && i === rings - 1 ? "#110FFF" : "#303030"}
            strokeWidth="1"
            strokeDasharray={i % 2 ? `${2 + (n % 5)} ${3 + (n % 4)}` : undefined}
          />
        );
      })}
      <line
        x1="60"
        y1={60 - item.powerTier * 0.5}
        x2="60"
        y2={60 + item.powerTier * 0.5}
        stroke={cobalt ? "#110FFF" : "#CACACA"}
        strokeWidth="1.5"
      />
      <circle cx="60" cy="60" r="2" fill="#CACACA" />
    </svg>
  );
}

export function ItemCard({ item }: { item: Item }) {
  const snippet = item.lore.split("\n")[0];

  return (
    <Link
      href={`/inventory/${item.itemId}`}
      className="block border border-[#303030] p-6 transition-all duration-200 hover:border-[#110FFF]"
    >
      <div className="flex gap-6 items-start">
        <ItemSigil item={item} size={96} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4 mb-3">
            <h3 className="text-xl font-bold text-[#F5F5F5] tracking-tight leading-tight">
              {item.canonicalName}
            </h3>
            <RarityBadge rarity={item.rarity} />
          </div>

          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
            Forged in {GAME_NAMES[item.originGame]}
          </p>

          <p className="text-[#CACACA] text-sm leading-relaxed mb-5 line-clamp-2">
            {snippet}
          </p>

          <PowerBar power={item.powerTier} />
        </div>
      </div>
    </Link>
  );
}
