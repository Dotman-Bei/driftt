"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Item, Translation } from "@/lib/types";

/*
  Nova Drift — a twin-stick sci-fi shooter.

  This is where the demo pays off. A greatsword forged in a dungeon shows up here
  as ordnance, and every stat the translation engine produced is load-bearing:

    DAMAGE        how hard each shot hits
    FIRE_RATE     how fast you can shoot (heavy weapons are slow)
    OVERHEAT_RISK how quickly sustained fire locks the weapon out
    SHIELD        how much you absorb before the hull takes it
    ENERGY_TYPE   the colour and behaviour of the projectile

  OVERHEAT_RISK is the point. In Emberfall the weapon paid for its power with low
  DURABILITY. The translation engine had to find this world's equivalent of that
  cost — and if it had simply dropped the cost, the item would be strictly better
  here than where it came from. That is the exploit consensus exists to prevent.
*/

const W = 760;
const H = 440;

interface Hostile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  r: number;
  hurt: number;
}

interface Shot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
}

interface GameState {
  px: number;
  py: number;
  hull: number;
  shield: number;
  maxShield: number;
  heat: number;
  lockout: number;
  cooldown: number;
  aimX: number;
  aimY: number;
  hostiles: Hostile[];
  shots: Shot[];
  kills: number;
  overheats: number;
  spawn: number;
  over: "won" | "lost" | null;
}

export interface Loadout {
  name: string;
  damage: number;
  shield: number;
  fireRate: number;
  energyType: string;
  overheatRisk: number;
  imported: boolean;
}

/** Stock cannon. What you fly with before you have carried anything in. */
export const STOCK: Loadout = {
  name: "Stock Pulse Cannon",
  damage: 22,
  shield: 18,
  fireRate: 38,
  energyType: "laser",
  overheatRisk: 15,
  imported: false,
};

export function loadoutFromTranslation(t: Translation): Loadout {
  const s = t.translatedStats;
  return {
    name: t.translatedName,
    damage: Number(s.DAMAGE ?? 30),
    shield: Number(s.SHIELD ?? 20),
    fireRate: Number(s.FIRE_RATE ?? 30),
    energyType: String(s.ENERGY_TYPE ?? "plasma"),
    overheatRisk: Number(s.OVERHEAT_RISK ?? 40),
    imported: true,
  };
}

export function loadoutFromNative(item: Item): Loadout {
  return {
    name: item.canonicalName,
    damage: Math.round(item.powerTier * 0.62 + 12),
    shield: Math.round(item.powerTier * 0.22),
    fireRate: Math.max(5, 42 - Math.round(item.powerTier * 0.3)),
    energyType: "plasma",
    overheatRisk: Math.min(95, Math.round(item.powerTier * 0.78)),
    imported: false,
  };
}

const ENERGY_COLOR: Record<string, string> = {
  plasma: "#FF2B2B",
  laser: "#CACACA",
  ion: "#110FFF",
};

const TARGET_KILLS = 24;

function initial(load: Loadout): GameState {
  return {
    px: W / 2,
    py: H / 2,
    hull: 100,
    shield: load.shield,
    maxShield: load.shield,
    heat: 0,
    lockout: 0,
    cooldown: 0,
    aimX: W / 2,
    aimY: 60,
    hostiles: [],
    shots: [],
    kills: 0,
    overheats: 0,
    spawn: 0,
    over: null,
  };
}

function spawnHostile(): Hostile {
  const edge = Math.floor(Math.random() * 4);
  const x = edge === 0 ? 0 : edge === 1 ? W : Math.random() * W;
  const y = edge === 2 ? 0 : edge === 3 ? H : Math.random() * H;
  return { x, y, vx: 0, vy: 0, hp: 34, r: 12, hurt: 0 };
}

export function NovaDrift({
  loadout,
  onVictory,
}: {
  loadout: Loadout;
  onVictory: (eventContext: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const game = useRef<GameState>(initial(loadout));
  const keys = useRef<Set<string>>(new Set());
  const firing = useRef(false);
  const loadRef = useRef(loadout);
  const notified = useRef(false);

  const [hud, setHud] = useState({
    hull: 100,
    shield: loadout.shield,
    heat: 0,
    locked: false,
    kills: 0,
    over: null as "won" | "lost" | null,
  });

  const restart = useCallback(() => {
    game.current = initial(loadRef.current);
    notified.current = false;
    setHud({
      hull: 100,
      shield: loadRef.current.shield,
      heat: 0,
      locked: false,
      kills: 0,
      over: null,
    });
  }, []);

  // A new loadout is a new run — you cannot swap weapons mid-fight. Sync the
  // ref here rather than during render, which React forbids.
  useEffect(() => {
    loadRef.current = loadout;
    restart();
  }, [loadout, restart]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["w", "a", "s", "d", " "].includes(k)) e.preventDefault();
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

    const move = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const g = game.current;
      g.aimX = ((e.clientX - rect.left) / rect.width) * W;
      g.aimY = ((e.clientY - rect.top) / rect.height) * H;
    };
    const downFire = () => (firing.current = true);
    const upFire = () => (firing.current = false);

    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mousedown", downFire);
    window.addEventListener("mouseup", upFire);

    let raf = 0;
    let frame = 0;

    const step = () => {
      const g = game.current;
      const L = loadRef.current;
      frame++;

      if (!g.over) {
        /* ---- ship ---------------------------------------------------- */
        const k = keys.current;
        let dx = 0;
        let dy = 0;
        if (k.has("a")) dx -= 1;
        if (k.has("d")) dx += 1;
        if (k.has("w")) dy -= 1;
        if (k.has("s")) dy += 1;
        if (dx || dy) {
          const len = Math.hypot(dx, dy);
          g.px = Math.max(14, Math.min(W - 14, g.px + (dx / len) * 3.4));
          g.py = Math.max(14, Math.min(H - 14, g.py + (dy / len) * 3.4));
        }

        /* ---- heat and the weapon lockout ------------------------------ */
        // Higher FIRE_RATE means a shorter gap between shots.
        const gap = Math.max(3, Math.round(30 - L.fireRate * 0.25));
        if (g.cooldown > 0) g.cooldown--;
        if (g.lockout > 0) {
          g.lockout--;
          g.heat = Math.max(0, g.heat - 1.1);
        } else {
          g.heat = Math.max(0, g.heat - 0.55);
        }

        const wantsFire = firing.current || k.has(" ");
        if (wantsFire && g.cooldown === 0 && g.lockout === 0) {
          const a = Math.atan2(g.aimY - g.py, g.aimX - g.px);
          g.shots.push({
            x: g.px + Math.cos(a) * 16,
            y: g.py + Math.sin(a) * 16,
            vx: Math.cos(a) * 8,
            vy: Math.sin(a) * 8,
            life: 70,
            dmg: L.damage,
          });
          g.cooldown = gap;

          // This is the translated durability penalty, doing its job.
          g.heat += 3 + L.overheatRisk * 0.11;
          if (g.heat >= 100) {
            g.heat = 100;
            g.lockout = 110;
            g.overheats++;
          }
        }

        /* ---- hostiles ------------------------------------------------- */
        g.spawn--;
        if (g.spawn <= 0 && g.hostiles.length < 9) {
          g.hostiles.push(spawnHostile());
          g.spawn = 42;
        }

        for (const h of g.hostiles) {
          if (h.hurt > 0) h.hurt--;
          const ex = g.px - h.x;
          const ey = g.py - h.y;
          const d = Math.hypot(ex, ey) || 1;
          h.x += (ex / d) * 1.15;
          h.y += (ey / d) * 1.15;

          if (d < h.r + 12) {
            const dmg = 0.55;
            if (g.shield > 0) g.shield = Math.max(0, g.shield - dmg);
            else g.hull -= dmg;
          }
        }

        /* ---- shots ---------------------------------------------------- */
        for (const s of g.shots) {
          s.x += s.vx;
          s.y += s.vy;
          s.life--;
          for (const h of g.hostiles) {
            if (h.hp > 0 && Math.hypot(h.x - s.x, h.y - s.y) < h.r + 3) {
              h.hp -= s.dmg;
              h.hurt = 5;
              s.life = 0;
            }
          }
        }
        g.shots = g.shots.filter(
          (s) => s.life > 0 && s.x > -20 && s.x < W + 20 && s.y > -20 && s.y < H + 20,
        );

        const before = g.hostiles.length;
        g.hostiles = g.hostiles.filter((h) => h.hp > 0);
        g.kills += before - g.hostiles.length;

        if (g.hull <= 0) {
          g.hull = 0;
          g.over = "lost";
        } else if (g.kills >= TARGET_KILLS) {
          g.over = "won";
        }

        if (frame % 5 === 0 || g.over) {
          setHud({
            hull: Math.max(0, Math.round(g.hull)),
            shield: Math.round(g.shield),
            heat: Math.round(g.heat),
            locked: g.lockout > 0,
            kills: g.kills,
            over: g.over,
          });
        }

        if (g.over === "won" && !notified.current) {
          notified.current = true;
          onVictory(
            `Player destroyed ${g.kills} hostiles in a single Nova Drift run using the ` +
              `${L.name}${L.imported ? ", a weapon translated in from Emberfall" : ""}. ` +
              `The weapon overheated ${g.overheats} time${g.overheats === 1 ? "" : "s"} under sustained fire, ` +
              `and the run ended with ${Math.round(g.hull)} of 100 hull remaining.`,
          );
        }
      }

      /* ---- render ---------------------------------------------------- */
      ctx.fillStyle = "#070707";
      ctx.fillRect(0, 0, W, H);

      ctx.fillStyle = "#141414";
      for (let i = 0; i < 60; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 71.3) % H;
        ctx.fillRect(sx, sy, 1, 1);
      }

      ctx.strokeStyle = "#303030";
      ctx.strokeRect(0.5, 0.5, W - 1, H - 1);

      const shotColor = ENERGY_COLOR[loadRef.current.energyType] ?? "#CACACA";

      for (const h of g.hostiles) {
        ctx.beginPath();
        ctx.moveTo(h.x, h.y - h.r);
        ctx.lineTo(h.x + h.r, h.y + h.r);
        ctx.lineTo(h.x - h.r, h.y + h.r);
        ctx.closePath();
        ctx.fillStyle = h.hurt > 0 ? "#FF2B2B" : "#303030";
        ctx.fill();
        ctx.strokeStyle = "#606060";
        ctx.stroke();
      }

      for (const s of g.shots) {
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 1.4, s.y - s.vy * 1.4);
        ctx.strokeStyle = shotColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      // The ship.
      const aim = Math.atan2(g.aimY - g.py, g.aimX - g.px);
      ctx.save();
      ctx.translate(g.px, g.py);
      ctx.rotate(aim);
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-9, 8);
      ctx.lineTo(-9, -8);
      ctx.closePath();
      ctx.fillStyle = g.lockout > 0 ? "#606060" : "#F5F5F5";
      ctx.fill();
      ctx.restore();

      if (g.shield > 0) {
        ctx.beginPath();
        ctx.arc(g.px, g.py, 19, 0, Math.PI * 2);
        ctx.strokeStyle = "#303030";
        ctx.globalAlpha = 0.4 + (g.shield / Math.max(1, g.maxShield)) * 0.6;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mousedown", downFire);
      window.removeEventListener("mouseup", upFire);
    };
  }, [onVictory]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-4 mb-4 font-mono text-xs tracking-[0.15em] uppercase">
        <span className="text-[#606060]">
          Hull <span className="text-[#F5F5F5]">{hud.hull}</span>
        </span>
        <span className="text-[#606060]">
          Shield <span className="text-[#F5F5F5]">{hud.shield}</span>
        </span>
        <span className="text-[#606060]">
          Heat{" "}
          <span style={{ color: hud.locked ? "#FF2B2B" : "#F5F5F5" }}>
            {hud.locked ? "locked out" : `${hud.heat}%`}
          </span>
        </span>
        <span className="text-[#606060]">
          Kills{" "}
          <span className="text-[#F5F5F5]">
            {hud.kills} / {TARGET_KILLS}
          </span>
        </span>
      </div>

      <div className="relative border border-[#303030]">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="block w-full h-auto cursor-crosshair"
        />

        {hud.over && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-[#070707]/90">
            <p
              className="font-mono text-xs tracking-[0.2em] uppercase text-center px-6"
              style={{
                color: hud.over === "won" ? "#00FF66" : "#FF2B2B",
                textShadow:
                  hud.over === "won" ? "0 0 20px rgba(0, 255, 102, 0.4)" : "none",
              }}
            >
              {hud.over === "won"
                ? "Sector cleared — the forge is deciding what you earned"
                : "Hull breached"}
            </p>
            <button
              onClick={restart}
              className="px-8 py-4 border border-[#303030] text-[#CACACA] font-medium transition-all duration-200 hover:scale-95 hover:border-[#110FFF] hover:text-[#F5F5F5]"
            >
              Launch again
            </button>
          </div>
        )}
      </div>

      <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#606060] mt-4">
        WASD to fly · Mouse to aim · Hold to fire · Sustained fire overheats the weapon
      </p>
    </div>
  );
}
