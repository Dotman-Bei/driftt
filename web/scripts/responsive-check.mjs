/*
  Drive headless Edge/Chrome across the app at real device widths and flag any
  horizontal overflow (the page scrolling sideways) or elements wider than the
  viewport. Not committed as a test — a one-off responsiveness audit.

    node scripts/responsive-check.mjs
*/

import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const EXECUTABLES = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const WIDTHS = [
  { name: "iPhone SE", w: 320, h: 568 },
  { name: "iPhone 12", w: 390, h: 844 },
  { name: "tablet", w: 768, h: 1024 },
  { name: "laptop", w: 1024, h: 768 },
  { name: "desktop", w: 1440, h: 900 },
];

const PAGES = [
  "/",
  "/inventory",
  "/inventory/0",
  "/translate/0",
  "/forge",
  "/games/emberfall",
  "/games/nova-drift",
];

const exe = EXECUTABLES.find((p) => existsSync(p));
if (!exe) throw new Error("no Chrome/Edge found");
console.log(`browser: ${exe}`);

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: "new",
  args: ["--no-sandbox"],
});

let problems = 0;

for (const { name, w, h } of WIDTHS) {
  console.log(`\n── ${name} (${w}px) ──`);
  for (const path of PAGES) {
    const page = await browser.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    try {
      await page.goto(`http://localhost:3000${path}`, {
        waitUntil: "networkidle2",
        timeout: 30000,
      });
      // Let canvases / fonts settle.
      await new Promise((r) => setTimeout(r, 400));

      const report = await page.evaluate((viewportW) => {
        const doc = document.documentElement;
        const scrollW = doc.scrollWidth;
        const bad = [];
        // Find elements that extend past the viewport's right edge.
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width > 0 && r.right > viewportW + 1) {
            const cls =
              typeof el.className === "string" ? el.className.slice(0, 50) : "";
            bad.push(
              `${el.tagName.toLowerCase()}.${cls.split(" ")[0]} right=${Math.round(r.right)}`,
            );
          }
        }
        return { scrollW, overflow: scrollW > viewportW + 1, offenders: [...new Set(bad)].slice(0, 5) };
      }, w);

      const flag = report.overflow ? "✗ OVERFLOW" : "✓";
      console.log(
        `  ${flag}  ${path.padEnd(22)} scrollW=${report.scrollW}` +
          (report.offenders.length ? `  → ${report.offenders.join(" | ")}` : ""),
      );
      if (report.overflow) problems++;
    } catch (err) {
      console.log(`  ?   ${path.padEnd(22)} ${String(err.message).slice(0, 50)}`);
    }
    await page.close();
  }
}

await browser.close();
console.log(
  problems === 0
    ? "\nRESULT: no horizontal overflow at any width ✓"
    : `\nRESULT: ${problems} page/width combos overflow — see ✗ rows`,
);
process.exit(problems === 0 ? 0 : 1);
