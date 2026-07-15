"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { connect, disconnect, useDriftt } from "@/lib/store";

const LINKS = [
  { href: "/inventory", label: "Inventory" },
  { href: "/games/emberfall", label: "Emberfall" },
  { href: "/games/nova-drift", label: "Nova Drift" },
  { href: "/forge", label: "Forge" },
];

interface Ethereum {
  request(args: { method: string }): Promise<string[]>;
}

async function connectWallet(): Promise<string> {
  const eth = (globalThis as { ethereum?: Ethereum }).ethereum;
  if (eth) {
    try {
      const accounts = await eth.request({ method: "eth_requestAccounts" });
      if (accounts?.[0]) return accounts[0];
    } catch {
      // User declined, or no injected wallet. Fall through to a demo account so
      // the demo is never gated behind a wallet install.
    }
  }
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function Nav() {
  const { address } = useDriftt();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);

  /*
    The home hero runs a full-bleed image up behind this bar, so there the nav
    floats over the image with no background of its own — any panel or border
    would cut the image into two fields and give away the seam. It only earns a
    background once you have scrolled off the hero. Every other route keeps the
    bar in flow, opaque, exactly as it looked before.
  */
  const overHero = pathname === "/";

  useEffect(() => {
    if (!overHero) return;
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll(); // A refresh mid-page restores the solid bar without a flash.
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [overHero]);

  const transparent = overHero && !scrolled;

  /*
    Asphalt (#606060) is a resting colour for the bar's own black panel. Floating
    over the hero image it disappears, so while the bar is transparent the labels
    step up one rung of the ramp and step back down the moment the panel returns.
  */
  const idleLink = transparent
    ? "text-[#CACACA] hover:text-[#F5F5F5]"
    : "text-[#606060] hover:text-[#CACACA]";

  return (
    <header
      className={`top-0 z-50 border-b transition-colors duration-300 ${
        overHero ? "fixed inset-x-0" : "sticky"
      } ${
        transparent
          ? "border-transparent bg-transparent"
          : "border-[#303030] bg-[#070707]/90 backdrop-blur-sm"
      }`}
    >
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link
          href="/"
          className="font-display text-lg font-bold tracking-tight text-[#F5F5F5]"
        >
          Driftt
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`font-mono text-xs tracking-[0.2em] uppercase transition-colors duration-200 ${
                pathname.startsWith(link.href) ? "text-[#F5F5F5]" : idleLink
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <span
            className={`hidden sm:inline font-mono text-[10px] tracking-[0.2em] uppercase transition-colors duration-200 ${
              transparent ? "text-[#CACACA]" : "text-[#606060]"
            }`}
          >
            GenLayer testnet
          </span>

          {address ? (
            <button
              onClick={disconnect}
              className="font-mono text-xs px-4 py-2 border border-[#303030] text-[#CACACA] transition-all duration-200 hover:scale-95 hover:border-[#110FFF] hover:text-[#F5F5F5]"
            >
              {address.slice(0, 6)}…{address.slice(-4)}
            </button>
          ) : (
            <button
              onClick={async () => connect(await connectWallet())}
              className="font-mono text-xs px-4 py-2 bg-[#F5F5F5] text-[#070707] font-medium transition-all duration-200 hover:scale-95 active:scale-90 hover:bg-[#110FFF] hover:text-[#F5F5F5]"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
