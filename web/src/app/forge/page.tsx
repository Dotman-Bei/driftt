"use client";

import { useDriftt } from "@/lib/store";
import { ForgeFeed } from "@/components/Feeds";
import { Eyebrow, Headline, Lede, Section } from "@/components/ui";

export default function ForgePage() {
  const { activity } = useDriftt();

  return (
    <Section className="border-t-0">
      <Eyebrow>Live forge</Eyebrow>
      <Headline className="max-w-3xl">Items, as they are created.</Headline>
      <Lede>
        Every line is a gameplay event that an Intelligent Contract turned into an asset,
        and a validator set signed off on.
      </Lede>

      <div className="mt-16">
        <ForgeFeed activity={activity} />
      </div>
    </Section>
  );
}
