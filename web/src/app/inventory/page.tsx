"use client";

import { useDriftt } from "@/lib/store";
import { ItemCard } from "@/components/ItemCard";
import { ButtonLink, Eyebrow, Headline, Lede, Section } from "@/components/ui";
import { GAME_NAMES } from "@/lib/rulesets";

export default function InventoryPage() {
  const { address, items, translations } = useDriftt();

  const mine = address ? items.filter((i) => i.owner === address) : items;

  return (
    <Section className="border-t-0">
      <Eyebrow>Cross-game inventory</Eyebrow>
      <Headline className="max-w-3xl">Everything you have earned, everywhere.</Headline>

      {mine.length === 0 ? (
        <>
          <Lede>
            Nothing yet. Items are not minted by hand — they are forged by the game when
            you do something worth rewarding.
          </Lede>
          <ButtonLink href="/games/emberfall">Play Emberfall</ButtonLink>
        </>
      ) : (
        <>
          <Lede>
            {mine.length} item{mine.length === 1 ? "" : "s"} ·{" "}
            {translations.length} cross-game translation
            {translations.length === 1 ? "" : "s"} settled.
          </Lede>

          <div className="grid md:grid-cols-2 gap-px bg-[#303030] mt-16 border border-[#303030]">
            {mine.map((item) => {
              const carried = translations.filter((t) => t.itemId === item.itemId);
              return (
                <div key={item.itemId} className="bg-[#070707]">
                  <ItemCard item={item} />
                  {carried.length > 0 && (
                    <p className="px-6 pb-6 -mt-2 font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060]">
                      Also playable in{" "}
                      {carried.map((t) => GAME_NAMES[t.targetGame]).join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </Section>
  );
}
