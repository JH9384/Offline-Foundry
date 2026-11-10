// The brand kit's colours, fonts and mark written into a Hollama checkout. Nothing here names a colour:
// every value is read from the kit's warm layer (vendor/hologram-brand-kit/css/hologram-warm.css, the kit
// at BRAND_KIT_REV) and converted to the HSL triplets Hollama's stylesheet consumes through Tailwind.
//
//   node tools/kit-to-hsl.mjs <hollama checkout>
//
// Writes  src/app.pcss                 the variable block, light from :root and dark from .dark
//         static/fonts/hologram/*      the kit's web fonts, their OFL files and one @font-face sheet
//         static/favicon.svg           the kit's white logomark, the H
//
// The mapping, by depth (Hollama's shade 0 is its raised layer, shade 2 its page):
//   shade-0 card · shade-1 sidebar · shade-2 background · shade-3 muted · shade-4 accent · shade-5 border · shade-6 ring
//   text-shade-0 primary · text-shade-1 foreground · text-shade-2 muted-foreground
//   primary brand · negative destructive
// Hollama's positive, warning and the muted tints have no token in the kit and keep Hollama's values.
// A kit colour with alpha (the dark border and input) is composited over the kit's background first,
// because an HSL triplet carries no alpha.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const kit = path.join(root, "vendor", "hologram-brand-kit");
const target = path.resolve(process.argv[2] || "");
if (!fs.existsSync(path.join(target, "src", "app.pcss"))) throw new Error("not a Hollama checkout: " + target);

const css = fs.readFileSync(path.join(kit, "css", "hologram-warm.css"), "utf8");
function block(selector) {
  const m = css.match(new RegExp(selector.replace(".", "\\.") + "\\s*\\{([^}]*)\\}"));
  if (!m) throw new Error("no " + selector + " block in the kit's CSS");
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^\s*--([a-z0-9-]+):\s*([^;]+);/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
}
const hex = (s) => {
  const h = s.replace("#", "");
  const n = h.length === 3 || h.length === 4 ? [...h].map((c) => c + c).join("") : h;
  const v = parseInt(n.slice(0, 6), 16);
  const a = n.length === 8 ? parseInt(n.slice(6, 8), 16) / 255 : 1;
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255, a };
};
const over = (c, bg) => ({ r: c.r * c.a + bg.r * (1 - c.a), g: c.g * c.a + bg.g * (1 - c.a), b: c.b * c.a + bg.b * (1 - c.a), a: 1 });
function hsl({ r, g, b }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
  }
  return `${Math.round(h)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}
const MAP = [["shade-0", "card"], ["shade-1", "sidebar"], ["shade-2", "background"], ["shade-3", "muted"], ["shade-4", "accent"], ["shade-5", "border"], ["shade-6", "ring"],
  ["text-shade-0", "primary"], ["text-shade-1", "foreground"], ["text-shade-2", "muted-foreground"], ["primary", "brand"], ["negative", "destructive"]];
function rows(tokens) {
  const bg = hex(tokens.background);
  return MAP.map(([ours, theirs]) => {
    if (!tokens[theirs]) throw new Error("the kit has no --" + theirs);
    const c = hex(tokens[theirs]);
    return `\t\t--color-${ours}: ${hsl(c.a < 1 ? over(c, bg) : c)};`;
  }).join("\n");
}
const light = block(":root"), dark = block(".dark");
const pcss = path.join(target, "src", "app.pcss");
let text = fs.readFileSync(pcss, "utf8");
const KEEP = ["negative-muted", "warning", "warning-muted", "positive", "positive-muted"];
function rewrite(selector, tokens) {
  const re = new RegExp("(" + selector.replace(/[[\]']/g, "\\$&") + "\\s*\\{)([^}]*)(\\})");
  const m = text.match(re);
  if (!m) throw new Error("no " + selector + " block in app.pcss");
  const kept = m[2].split("\n").filter((l) => KEEP.some((k) => l.includes("--color-" + k + ":"))).join("\n");
  text = text.replace(re, `$1\n\t\t/* the Hologram brand kit's tokens, written by tools/kit-to-hsl.mjs; do not edit */\n${rows(tokens)}\n\n${kept}\n\t$3`);
}
rewrite(":root", light);
rewrite("[data-color-theme='dark']", dark);
fs.writeFileSync(pcss, text);

const fontsDir = path.join(target, "static", "fonts");
fs.rmSync(fontsDir, { recursive: true, force: true });
const out = path.join(fontsDir, "hologram");
fs.mkdirSync(out, { recursive: true });
const FACES = [["Geist", "Geist-Regular", 400], ["Geist", "Geist-Medium", 500], ["Geist", "Geist-SemiBold", 600], ["Geist", "Geist-Bold", 700], ["Geist Mono", "GeistMono-Regular", 400], ["Geist Mono", "GeistMono-Medium", 500]];
let faces = "/* the Hologram brand kit's web fonts (OFL), placed by tools/kit-to-hsl.mjs */\n";
for (const [family, file, weight] of FACES) {
  fs.copyFileSync(path.join(kit, "fonts", file + ".woff2"), path.join(out, file + ".woff2"));
  faces += `@font-face { font-family: "${family}"; font-style: normal; font-weight: ${weight}; font-display: swap; src: url("./${file}.woff2") format("woff2"); }\n`;
}
fs.writeFileSync(path.join(out, "hologram.css"), faces);
fs.copyFileSync(path.join(kit, "fonts", "OFL.txt"), path.join(out, "OFL-Geist.txt"));
fs.copyFileSync(path.join(kit, "logos", "svg", "logomark", "Hologram_Logomark_White.svg"), path.join(target, "static", "favicon.svg"));
fs.rmSync(path.join(target, "static", "favicon.png"), { force: true });
console.log(`kit-to-hsl: ${MAP.length} variables per mode from the kit, ${KEEP.length} kept from Hollama, ${FACES.length} faces, the mark`);
