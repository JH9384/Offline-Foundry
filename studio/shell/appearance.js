// The appearance switch on the renderer's UI: Immersive, Dark, Light, the same canonical state and hooks
// Hologram OS keeps (holo.theme.v1 on <html>: data-holo-palette, data-holo-immersive, --holo-wallpaper),
// mirrored into the renderer's own theme (the dark or light class on <html>, and its localStorage "theme"),
// and followed the other way when the renderer's settings page switches its theme. Adapters only.
const KEY = "holo.theme.v1";
const $ = (id) => document.getElementById(id);
const WALLS = JSON.parse($("wallpapers").textContent);
const root = document.documentElement;

function readTheme() { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch (e) { return {}; } }
function applyTheme(s) {
  const palette = s.palette === "light" ? "light" : "dark";
  root.setAttribute("data-holo-palette", palette);
  root.setAttribute("data-holo-immersive", s.immersive ? "on" : "off");
  root.style.setProperty("color-scheme", palette);
  if (s.wallpaper) root.style.setProperty("--holo-wallpaper", `url(${JSON.stringify(s.wallpaper)})`);
  try { localStorage.setItem(KEY, JSON.stringify({ look: 3, ...s })); } catch (e) {}
  // the renderer's theme follows the palette: its provider reads the class it set and its stored choice.
  if (!root.classList.contains(palette)) { root.classList.remove("light", "dark"); root.classList.add(palette); }
  try { localStorage.setItem("theme", palette); } catch (e) {}
  const mode = s.immersive ? "immersive" : palette;
  for (const b of document.querySelectorAll(".mode")) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  for (const b of document.querySelectorAll(".wall")) b.setAttribute("aria-pressed", String(!!s.immersive && b.dataset.wall === s.wallpaper));
  $("walls").classList.toggle("on", !!s.immersive);
}
function setMode(mode) {
  const s = readTheme();
  if (mode === "immersive") applyTheme({ palette: "dark", immersive: true, wallpaper: s.wallpaper || WALLS[0].file });
  else applyTheme({ palette: mode, immersive: false, wallpaper: s.wallpaper || WALLS[0].file });
}
$("appearance").onclick = (e) => { e.stopPropagation(); const open = $("popover").hidden; $("popover").hidden = !open; $("appearance").setAttribute("aria-expanded", String(open)); };
document.addEventListener("click", (e) => { if (!$("popover").contains(e.target)) { $("popover").hidden = true; $("appearance").setAttribute("aria-expanded", "false"); } });
for (const b of document.querySelectorAll(".mode")) b.onclick = () => setMode(b.dataset.mode);
for (const b of document.querySelectorAll(".wall")) b.onclick = () => applyTheme({ palette: "dark", immersive: true, wallpaper: b.dataset.wall });
applyTheme({ ...readTheme() });

// When the renderer's own settings switch its theme class, the palette follows (and Immersive, which is a
// dark look, steps aside for Light).
new MutationObserver(() => {
  const s = readTheme();
  const rtheme = root.classList.contains("light") ? "light" : root.classList.contains("dark") ? "dark" : null;
  if (!rtheme || rtheme === (s.palette === "light" ? "light" : "dark")) return;
  applyTheme({ ...s, palette: rtheme, immersive: rtheme === "light" ? false : s.immersive });
}).observe(root, { attributes: true, attributeFilter: ["class"] });
