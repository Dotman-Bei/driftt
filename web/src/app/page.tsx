"use client";

import Image from "next/image";
import Link from "next/link";
import heroVortex from "@/assets/hero-vortex.jpg";
import { GAMES } from "@/lib/rulesets";
import {
  ButtonLink,
  Eyebrow,
  GenLayerMark,
  GlowWord,
  Headline,
  Lede,
  Section,
  StrokeText,
} from "@/components/ui";

/*
  Cobalt budget for this page — three uses, and no more:
    1. The GlowWord in the hero headline.
    2. The primary CTA, which is neutral at rest and flips to cobalt on hover.
    3. The consensus pulse in section 4.
  Success green appears exactly once: the approved line in section 4.
*/

export default function Home() {
  return (
    <>
      {/* 1. HERO --------------------------------------------------------- */}
      {/*
        The nav is fixed, so it floats over the top of this container and the
        image reads as one unbroken field behind both.

        Two gradient layers sit between the image and the type, and neither is a
        flat scrim — a full-frame dim would kill the grain that makes the image
        worth using. One fades the image down into Carbon Void at the bottom so
        the hero has no seam; the other darkens only the left column the type
        occupies, and is fully clear of the vortex.
      */}
      <div className="relative min-h-screen flex items-center">
        {/*
          The source is a 736x1308 portrait. Cropped to a landscape viewport,
          `object-top` would cut the frame off above the vortex and lose the
          subject entirely, so the focal point is only pinned to the top while
          the viewport is narrow enough to show the image's full height.
        */}
        {/*
          The swirl blows out to near-white at its core, which is brighter than
          the body copy laid over it. Pulling the whites down turns the image back
          into a field the type can sit on — the blacks are already at floor, so
          this costs the vortex its glare and nothing else.
        */}
        <Image
          src={heroVortex}
          alt=""
          fill
          preload
          sizes="100vw"
          className="-z-10 object-cover object-top md:object-center brightness-[0.55]"
        />

        {/*
          The type column. The swirl is brightest exactly where the eyebrow and
          body copy land, and a portrait source cropped to a landscape hero has
          no horizontal crop left to spend, so the image cannot be moved out from
          under the text — it has to be darkened under it instead. The fade ends
          before the vortex. Narrow viewports carry the copy further right, so
          the fade has to travel further with it.
        */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#070707]/95 via-[#070707]/70 via-40% to-transparent to-90% md:via-[#070707]/60 md:via-35% md:to-75%" />

        {/* Lands the image on Carbon Void by the bottom quarter, so the hero
            meets the next section with no edge to see. */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-transparent via-50% to-[#070707] to-75%" />

        <section className="w-full px-6 pt-32 pb-28">
          <div className="max-w-6xl mx-auto">
            <Eyebrow>Cross-game asset layer</Eyebrow>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold text-[#F5F5F5] tracking-tight leading-[1.05] mb-8 max-w-4xl">
              Items that <GlowWord>drift</GlowWord> between worlds.
            </h1>

            <p className="text-[#CACACA] text-lg leading-relaxed mb-12 max-w-2xl">
              The sword you earned in a dungeon becomes a weapon in a space shooter —
              translated and rebalanced by AI, then approved by validator consensus
              before it can touch another game&apos;s economy.
            </p>

            <div className="flex flex-wrap gap-4">
              <ButtonLink href="/games/emberfall">Forge an item</ButtonLink>
              <ButtonLink href="/inventory" variant="secondary">
                Open inventory
              </ButtonLink>
            </div>
          </div>
        </section>
      </div>

      {/* 2. THE PROBLEM -------------------------------------------------- */}
      <Section>
        <Eyebrow>The problem</Eyebrow>
        <Headline className="max-w-3xl">
          Every interoperable NFT today is the same game{" "}
          <StrokeText>rendered twice</StrokeText>.
        </Headline>
        <Lede>
          Items move between near-identical games because they share a hardcoded stat
          schema. Break the schema and the item breaks with it.
        </Lede>

        <div className="grid md:grid-cols-2 gap-12 mt-16 max-w-4xl">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
              What a shared schema gives you
            </p>
            <p className="font-mono text-sm text-[#CACACA] leading-relaxed">
              Fire Sword <span className="text-[#606060]">{"{ attack: 50 }"}</span>
            </p>
            <p className="text-[#CACACA] text-sm leading-relaxed mt-4">
              Meaningful in a fantasy game. Meaningless to a sci-fi shooter, a racing
              game, or anything that does not happen to have an ATK stat.
            </p>
          </div>

          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
              What Driftt stores instead
            </p>
            <p className="text-sm text-[#CACACA] leading-relaxed italic">
              &ldquo;A two-handed fire-aligned melee weapon, immensely heavy and slow to
              recover between strikes. It trades speed for the ability to end a fight in
              one committed blow.&rdquo;
            </p>
            <p className="text-[#CACACA] text-sm leading-relaxed mt-4">
              No numbers. No stat names. A description any game can reason about — which
              is the only thing that survives the trip.
            </p>
          </div>
        </div>
      </Section>

      {/* 3. THE TRANSLATION ENGINE --------------------------------------- */}
      <Section>
        <Eyebrow>Cross-game translation</Eyebrow>
        <Headline className="max-w-3xl">Your greatsword becomes a plasma lance.</Headline>
        <Lede>
          An Intelligent Contract reads what the item <em>is</em>, then writes what it
          should be in a world that has never heard of swords.
        </Lede>

        <div className="grid md:grid-cols-[1fr_1px_1fr] gap-10 md:gap-0 mt-16 border border-[#303030] p-10">
          <div className="md:pr-12">
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] mb-6">
              Emberfall · origin
            </p>
            <h3 className="text-2xl font-bold text-[#F5F5F5] tracking-tight mb-6">
              Ashfall Greatsword
            </h3>
            <dl className="border-t border-[#303030]">
              {[
                ["ATK", "71"],
                ["DEF", "18"],
                ["ELEMENT", "fire"],
                ["DURABILITY", "34"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between py-3 border-b border-[#303030]"
                >
                  <dt className="font-mono text-xs tracking-[0.15em] uppercase text-[#606060]">
                    {k}
                  </dt>
                  <dd className="font-mono text-sm text-[#F5F5F5]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-6">
              Power tier 88
            </p>
          </div>

          <div className="hidden md:block w-px bg-[#303030]" />

          <div className="md:pl-12">
            <p className="font-mono text-xs tracking-[0.2em] uppercase text-[#606060] mb-6">
              Nova Drift · translated
            </p>
            <h3 className="text-2xl font-bold text-[#F5F5F5] tracking-tight mb-6">
              Ashfall Plasma Lance
            </h3>
            <dl className="border-t border-[#303030]">
              {[
                ["DAMAGE", "67"],
                ["SHIELD", "19"],
                ["FIRE_RATE", "16"],
                ["ENERGY_TYPE", "plasma"],
                ["OVERHEAT_RISK", "69"],
              ].map(([k, v]) => (
                <div
                  key={k}
                  className="flex justify-between py-3 border-b border-[#303030]"
                >
                  <dt className="font-mono text-xs tracking-[0.15em] uppercase text-[#606060]">
                    {k}
                  </dt>
                  <dd className="font-mono text-sm text-[#F5F5F5]">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-6">
              Power tier 86 · drift −2
            </p>
          </div>
        </div>

        <p className="text-[#CACACA] text-sm leading-relaxed mt-10 max-w-2xl">
          Notice what the engine did with the durability penalty. Emberfall charges this
          weapon for its power by making it fragile. Nova Drift has no durability, so the
          cost was rewritten as overheat risk — the closest thing that world has to the
          same idea. That is a judgement about meaning, not arithmetic, and it is exactly
          what a deterministic contract cannot do.
        </p>
      </Section>

      {/* 4. HOW CONSENSUS PROTECTS THE ECONOMY --------------------------- */}
      <Section>
        <Eyebrow>Optimistic Democracy</Eyebrow>
        <Headline className="max-w-3xl">
          No single server decides what your item is worth.
        </Headline>
        <Lede>
          The fairness of every translation is a decentralized decision. That is the
          whole security model.
        </Lede>

        <div className="grid md:grid-cols-3 gap-12 mt-16">
          {[
            {
              n: "01",
              h: "A leader proposes",
              p: "One validator runs the Intelligent Contract's LLM logic and proposes the rebalanced item.",
            },
            {
              n: "02",
              h: "The others re-run it",
              p: "Every other validator independently executes the same non-deterministic logic, then compares results under the Equivalence Principle — semantic equivalence, never byte equality, because LLM output varies.",
            },
            {
              n: "03",
              h: "The outlier loses",
              p: "A node that proposes an overpowered item disagrees with the majority. The dispute escalates through appeals to a larger validator set, and the outlier is rejected.",
            },
          ].map((beat) => (
            <div key={beat.n}>
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-4">
                {beat.n}
              </p>
              <h3 className="text-xl font-bold text-[#F5F5F5] tracking-tight mb-3">
                {beat.h}
              </h3>
              <p className="text-[#CACACA] text-sm leading-relaxed">{beat.p}</p>
            </div>
          ))}
        </div>

        <div className="mt-20 border border-[#303030] p-12 flex flex-col items-center gap-6">
          <div className="h-12 w-px bg-[#110FFF] driftt-pulse" />
          <p
            className="font-mono text-xs tracking-[0.2em] uppercase text-center"
            style={{ color: "#00FF66", textShadow: "0 0 20px rgba(0, 255, 102, 0.4)" }}
          >
            3 of 3 validators agreed — balance approved
          </p>
          <GenLayerMark />
        </div>
      </Section>

      {/* 6. THE GAMES ---------------------------------------------------- */}
      <Section>
        <Eyebrow>The games</Eyebrow>
        <Headline className="max-w-3xl">
          Two genres that share nothing but the items.
        </Headline>
        <Lede>Deliberately different. If they were similar, none of this would be hard.</Lede>

        <div className="grid md:grid-cols-2 gap-px bg-[#303030] mt-16 border border-[#303030]">
          {GAMES.map((game) => (
            <Link
              key={game.id}
              href={`/games/${game.id}`}
              className="bg-[#070707] p-10 transition-colors duration-200 hover:bg-[#141414]"
            >
              <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-6">
                {game.genre}
              </p>
              <h3 className="text-3xl font-bold text-[#F5F5F5] tracking-tight mb-4">
                {game.name}
              </h3>
              <p className="text-[#CACACA] text-sm leading-relaxed">{game.blurb}</p>
            </Link>
          ))}
        </div>
      </Section>

      {/* 7. CTA / FOOTER ------------------------------------------------- */}
      {/* pb override trims the tall section padding under the footer row so the
          page doesn't end on a large empty band. */}
      <Section className="pb-8 md:pb-10">
        <div className="flex flex-col items-center text-center gap-8 py-8 md:py-12">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-[#F5F5F5] tracking-tight leading-tight max-w-2xl">
            Earn it once. Carry it everywhere.
          </h2>
          <ButtonLink href="/games/emberfall">Play Emberfall</ButtonLink>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-between gap-6 pt-10 md:pt-12 border-t border-[#303030]">
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060]">
            Driftt
          </p>
          <GenLayerMark showWordmark />
        </div>
      </Section>
    </>
  );
}
