"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Item, Translation } from "@/lib/types";

/*
  Emberfall — a top-down fantasy dungeon crawler.

  Deliberately small. It exists to prove one point: the item you earn here is
  earned by playing, and the item you import here arrives as a real weapon with
  real stats, not a picture in a wallet.

  Melee, deliberate, punishing. You close distance, you commit to a swing, and
  you get punished for it. That is the ruleset registered on-chain, and it is
  what the translation engine reasons against.
*/

const W = 760;
const H = 440;

interface Enemy {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  boss: boolean;
  hurt: number;
}

interface GameState {
  px: number;
  py: number;
  hp: number;
  facing: number;
  swing: number; // frames left in the current swing
  cooldown: number;
  enemies: Enemy[];
  kills: number;
  flawless: boolean;
  over: "won" | "lost" | null;
}

export interface EquippedWeapon {
  name: string;
  atk: number;
  element: string;
  durability: number;
  imported: boolean;
}

/** The starting sword every player has before they have earned anything. */
export const STARTER: EquippedWeapon = {
  name: "Notched Arming Sword",
  atk: 26,
  element: "fire",
  durability: 60,
  imported: false,
};

export function weaponFromTranslation(t: Translation): EquippedWeapon {
  const s = t.translatedStats;
  return {
    name: t.translatedName,
    atk: Number(s.ATK ?? 30),
    element: String(s.ELEMENT ?? "fire"),
    durability: Number(s.DURABILITY ?? 50),
    imported: true,
  };
}

export function weaponFromNative(item: Item): EquippedWeapon {
  // A native Emberfall item's power tier drives its swing — the forge already
  // balanced it against this game's 1-100 scale.
  return {
    name: item.canonicalName,
    atk: Math.round(item.powerTier * 0.78),
    element: "fire",
    durability: Math.max(5, 100 - Math.round(item.powerTier * 0.72)),
    imported: false,
  };
}

function spawnWave(): Enemy[] {
  const enemies: Enemy[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    enemies.push({
      x: W / 2 + Math.cos(angle) * 260,
      y: H / 2 + Math.sin(angle) * 160,
      hp: 30,
      maxHp: 30,
      r: 11,
      speed: 0.55,
      boss: false,
      hurt: 0,
    });
  }
  enemies.push({
    x: W / 2,
    y: 70,
    hp: 260,
    maxHp: 260,
    r: 26,
    speed: 0.34,
    boss: true,
    hurt: 0,
  });
  return enemies;
}

function initial(): GameState {
  return {
    px: W / 2,
    py: H - 70,
    hp: 100,
    facing: -Math.PI / 2,
    swing: 0,
    cooldown: 0,
    enemies: spawnWave(),
    kills: 0,
    flawless: true,
    over: null,
  };
}

export function Emberfall({
  weapon,
  onVictory,
}: {
  weapon: EquippedWeapon;
  onVictory: (eventContext: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<GameState>(initial());
  const keys = useRef<Set<string>>(new Set());
  const weaponRef = useRef(weapon);
  const notified = useRef(false);

  const [hud, setHud] = useState({ hp: 100, kills: 0, bossHp: 260, over: null as
    | "won"
    | "lost"
    | null });

  // Keep the render loop's view of the weapon current without re-creating the
  // loop on every equip. Syncing a ref during render is a React violation.
  useEffect(() => {
    weaponRef.current = weapon;
  }, [weapon]);

  const restart = useCallback(() => {
    game.current = initial();
    notified.current = false;
    setHud({ hp: 100, kills: 0, bossHp: 260, over: null });
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", " ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) {
        e.preventDefault();
      }
      keys.current.add(k);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let frame = 0;

    const step = () => {
      const g = game.current;
      const w = weaponRef.current;
      frame++;

      if (!g.over) {
        /* ---- player ------------------------------------------------- */
        const k = keys.current;
        let dx = 0;
        let dy = 0;
        if (k.has("a") || k.has("arrowleft")) dx -= 1;
        if (k.has("d") || k.has("arrowright")) dx += 1;
        if (k.has("w") || k.has("arrowup")) dy -= 1;
        if (k.has("s") || k.has("arrowdown")) dy += 1;

        if (dx || dy) {
          const len = Math.hypot(dx, dy);
          g.px = Math.max(16, Math.min(W - 16, g.px + (dx / len) * 2.7));
          g.py = Math.max(16, Math.min(H - 16, g.py + (dy / len) * 2.7));
          g.facing = Math.atan2(dy, dx);
        }

        if (g.cooldown > 0) g.cooldown--;

        // Committing to a swing is the whole combat model: it locks you in place
        // of a dodge, and heavier weapons make the commitment longer.
        if (k.has(" ") && g.cooldown === 0 && g.swing === 0) {
          g.swing = 12;
          g.cooldown = Math.round(22 + w.atk * 0.28);
        }
        if (g.swing > 0) g.swing--;

        /* ---- enemies ------------------------------------------------ */
        const reach = 52 + w.atk * 0.22;

        for (const e of g.enemies) {
          if (e.hurt > 0) e.hurt--;

          const ex = g.px - e.x;
          const ey = g.py - e.y;
          const dist = Math.hypot(ex, ey) || 1;
          e.x += (ex / dist) * e.speed;
          e.y += (ey / dist) * e.speed;

          // The swing lands on the frame it starts, in the arc you are facing.
          if (g.swing === 11) {
            const angleTo = Math.atan2(ey * -1, ex * -1);
            let diff = Math.abs(angleTo - g.facing);
            if (diff > Math.PI) diff = Math.PI * 2 - diff;
            if (dist < reach + e.r && diff < 1.1) {
              e.hp -= w.atk * (0.9 + Math.random() * 0.3);
              e.hurt = 6;
            }
          }

          if (dist < e.r + 12) {
            g.hp -= e.boss ? 0.42 : 0.16;
            g.flawless = false;
          }
        }

        const before = g.enemies.length;
        g.enemies = g.enemies.filter((e) => e.hp > 0);
        g.kills += before - g.enemies.length;

        if (g.hp <= 0) {
          g.hp = 0;
          g.over = "lost";
        } else if (g.enemies.length === 0) {
          g.over = "won";
        }

        if (frame % 6 === 0 || g.over) {
          const boss = g.enemies.find((e) => e.boss);
          setHud({
            hp: Math.max(0, Math.round(g.hp)),
            kills: g.kills,
            bossHp: boss ? Math.max(0, Math.round(boss.hp)) : 0,
            over: g.over,
          });
        }

        if (g.over === "won" && !notified.current) {
          notified.current = true;
          const flawless = g.flawless ? " without taking a single hit" : "";
          const hp = Math.round(g.hp);
          onVictory(
            `Player defeated the Ashfall Dragon and cleared the Cinder Vault${flawless}, ` +
              `wielding the ${w.name}${w.imported ? " (an item imported from another world)" : ""}. ` +
              `They finished the fight on ${hp} of 100 health.`,
          );
        }
      }

      /* ---- render --------------------------------------------------- */
      ctx.fillStyle = "#070707";
      ctx.fillRect(0, 0, W, H);

      // Dungeon floor grid.
      ctx.strokeStyle = "#141414";
      ctx.lineWidth = 1;
      for (let x = 0; x <= W; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y <= H; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "#303030";
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      for (const e of g.enemies) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fillStyle = e.hurt > 0 ? "#FF2B2B" : e.boss ? "#606060" : "#303030";
        ctx.fill();
        ctx.strokeStyle = e.boss ? "#CACACA" : "#606060";
        ctx.stroke();

        if (e.boss) {
          ctx.fillStyle = "#303030";
          ctx.fillRect(e.x - 40, e.y - e.r - 14, 80, 3);
          ctx.fillStyle = "#CACACA";
          ctx.fillRect(e.x - 40, e.y - e.r - 14, 80 * (e.hp / e.maxHp), 3);
        }
      }

      // The swing arc. Cobalt, and only for the frames it is actually live —
      // the accent arrives on intent, never at rest.
      if (g.swing > 0) {
        const reach = 52 + weaponRef.current.atk * 0.22;
        ctx.beginPath();
        ctx.arc(g.px, g.py, reach, g.facing - 1.1, g.facing + 1.1);
        ctx.strokeStyle = "#110FFF";
        ctx.lineWidth = 2 + g.swing * 0.25;
        ctx.globalAlpha = g.swing / 12;
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
      }

      ctx.beginPath();
      ctx.arc(g.px, g.py, 12, 0, Math.PI * 2);
      ctx.fillStyle = "#F5F5F5";
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(g.px, g.py);
      ctx.lineTo(g.px + Math.cos(g.facing) * 20, g.py + Math.sin(g.facing) * 20);
      ctx.strokeStyle = "#606060";
      ctx.stroke();

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [onVictory]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4 font-mono text-xs tracking-[0.15em] uppercase">
        <span className="text-[#606060]">
          Health <span className="text-[#F5F5F5]">{hud.hp}</span>
        </span>
        <span className="text-[#606060]">
          Boss <span className="text-[#F5F5F5]">{hud.bossHp}</span>
        </span>
        <span className="text-[#606060]">
          Slain <span className="text-[#F5F5F5]">{hud.kills}</span>
        </span>
      </div>

      <div className="relative border border-[#303030]">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block w-full h-auto"
          style={{ imageRendering: "pixelated" }}
        />

        {hud.over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#070707]/90">
            <p
              className="font-mono text-xs tracking-[0.2em] uppercase"
              style={{
                color: hud.over === "won" ? "#00FF66" : "#FF2B2B",
                textShadow:
                  hud.over === "won" ? "0 0 20px rgba(0, 255, 102, 0.4)" : "none",
              }}
            >
              {hud.over === "won"
                ? "Ashfall Dragon slain — the forge is deciding what you earned"
                : "You died in the dark"}
            </p>
            <button
              onClick={restart}
              className="px-8 py-4 border border-[#303030] text-[#CACACA] font-medium transition-all duration-200 hover:scale-95 hover:border-[#110FFF] hover:text-[#F5F5F5]"
            >
              Enter again
            </button>
          </div>
        )}
      </div>

      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-4">
        WASD to move · Space to swing · Heavier weapons swing slower
      </p>
    </div>
  );
}
