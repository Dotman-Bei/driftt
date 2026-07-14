"use client";

import Link from "next/link";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { Rarity } from "@/lib/types";

/* ---------------------------------------------------------------- section */

export function Section({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`py-28 px-6 border-t border-[#303030] ${className}`}
    >
      <div className="max-w-6xl mx-auto">{children}</div>
    </section>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="font-mono text-xs tracking-[0.2em] text-[#606060] uppercase mb-6">
      {children}
    </p>
  );
}

export function Headline({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={`text-4xl md:text-5xl font-bold text-[#F5F5F5] tracking-tight leading-tight mb-6 ${className}`}
    >
      {children}
    </h2>
  );
}

export function Lede({ children }: { children: ReactNode }) {
  return <p className="text-[#CACACA] text-lg leading-relaxed mb-8">{children}</p>;
}

/* ------------------------------------------------------------ typography */

/**
 * Stroke text must be an inline style. The Tailwind v4 class equivalent does not
 * apply reliably.
 */
export function StrokeText({
  children,
  color = "#F5F5F5",
}: {
  children: ReactNode;
  color?: string;
}) {
  const style: CSSProperties = {
    WebkitTextStroke: `2px ${color}`,
    color: "transparent",
  };
  return <span style={style}>{children}</span>;
}

/**
 * Glow-on-hover has to be a React component with state. A CSS `text-shadow`
 * hover class will not apply.
 *
 * This is one of the page's 2-3 cobalt uses. A cobalt glow against Carbon Void
 * is the single strongest visual moment in this palette — spend it well.
 */
export function GlowWord({
  children,
  color = "#110FFF",
}: {
  children: ReactNode;
  color?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <span
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color,
        transition: "text-shadow 0.3s ease",
        textShadow: hovered
          ? `0 0 20px ${color}E6, 0 0 50px ${color}99, 0 0 100px ${color}4D`
          : "none",
      }}
    >
      {children}
    </span>
  );
}

/* --------------------------------------------------------------- buttons */

/**
 * Button law: buttons SHRINK on hover, never grow. The primary starts neutral
 * and flips to cobalt on hover — the accent appears on intent, not at rest,
 * which is what keeps it precious.
 */
const PRIMARY =
  "inline-block px-8 py-4 bg-[#F5F5F5] text-[#070707] font-medium transition-all duration-200 " +
  "hover:scale-95 active:scale-90 hover:bg-[#110FFF] hover:text-[#F5F5F5] " +
  "disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-[#F5F5F5] disabled:hover:text-[#070707] disabled:cursor-not-allowed";

const SECONDARY =
  "inline-block px-8 py-4 border border-[#303030] text-[#CACACA] transition-all duration-200 " +
  "hover:scale-95 hover:border-[#110FFF] hover:text-[#F5F5F5] " +
  "disabled:opacity-40 disabled:hover:scale-100 disabled:hover:border-[#303030] disabled:cursor-not-allowed";

export function ButtonLink({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <Link href={href} className={variant === "primary" ? PRIMARY : SECONDARY}>
      {children}
    </Link>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${variant === "primary" ? PRIMARY : SECONDARY} ${className}`}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- rarity */

/**
 * Rarity mapped onto the brand ramp. Inventing gem colors is the fastest way to
 * make this look like every other NFT project.
 */
const RARITY_STYLE: Record<Rarity, string> = {
  common: "border-[#CACACA] text-[#CACACA]",
  rare: "border-[#303030] text-[#F5F5F5]",
  epic: "border-[#110FFF] text-[#F5F5F5]",
  legendary: "border-[#110FFF] text-[#F5F5F5]",
};

export function RarityBadge({ rarity }: { rarity: Rarity }) {
  return (
    <span
      className={`inline-block border px-2 py-1 font-mono text-[10px] tracking-[0.2em] uppercase ${RARITY_STYLE[rarity]}`}
      style={
        rarity === "legendary"
          ? { boxShadow: "0 0 12px rgba(0, 255, 102, 0.25)" }
          : undefined
      }
    >
      {rarity}
    </span>
  );
}

export function PowerBar({ power }: { power: number }) {
  return (
    <div>
      <div className="flex justify-between font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mb-2">
        <span>Power tier</span>
        <span className="text-[#CACACA]">{power} / 100</span>
      </div>
      <div className="h-px w-full bg-[#303030]">
        <div
          className="h-px bg-[#CACACA]"
          style={{ width: `${Math.max(0, Math.min(100, power))}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ mark */

export function GenLayerMark({
  showWordmark = false,
  className = "",
}: {
  showWordmark?: boolean;
  className?: string;
}) {
  // The one place Photon (#FFFFFF) is correct: the official asset stays
  // uncompromised. Clearspace is the height of the "G" on all sides.
  return (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <span className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060]">
        Powered by
      </span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={
          showWordmark
            ? "/brand/genlayer-logo-white-cropped.svg"
            : "/brand/genlayer-mark-white.svg"
        }
        alt="GenLayer"
        className={showWordmark ? "h-4 w-auto" : "h-5 w-auto"}
        style={{ margin: "0 0.5rem" }}
      />
    </span>
  );
}
