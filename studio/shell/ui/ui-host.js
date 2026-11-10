// The chat app's host on this origin. It is ours, not the chat app's: the app loads it as one module
// script and knows nothing about it. `../` from here is the shell root, whatever subpath the site is
// published under.
//
//   1. The shell's service worker is what answers the endpoint the connection names (seeded before
//      this by ui-seed.js). A visitor who arrives before the worker is there waits for it and reloads
//      once, before anything else starts, because a list of models asked for uncontrolled comes back
//      empty and a download begun uncontrolled begins again.
//   2. The engine is started at once, so the model is resident before the first prompt, and the one
//      long wait, the first download, is shown as a bar. Nothing here names a colour: the bar uses the
//      brand kit's variables, which the page already defines.
const SHELL = new URL("../", import.meta.url);
const RELOADED = "hologram-ui-reloaded";
if (!navigator.serviceWorker) throw new Error("this browser has no service worker");
if (!navigator.serviceWorker.controller) {
  navigator.serviceWorker.register(new URL("sw.js", SHELL).href).catch(() => {});
  // Nothing below runs while this page is waiting, because a list of models asked for uncontrolled
  // comes back empty and a download begun uncontrolled would begin again after the reload. The wait is
  // for the worker to exist, not to claim: a worker that activated while another page held the old
  // registration never claims this one, and a fresh navigation under an active worker is controlled
  // from its first byte. So one reload, once per visit, settles both.
  const deadline = Date.now() + 20000;
  while (!navigator.serviceWorker.controller && Date.now() < deadline) {
    const registration = await navigator.serviceWorker.getRegistration(new URL("sw.js", SHELL).href);
    if (registration && registration.active) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!sessionStorage.getItem(RELOADED)) {
    sessionStorage.setItem(RELOADED, "1");
    location.reload();
  }
  await new Promise(() => {});
}

sessionStorage.removeItem(RELOADED);

const bar = document.createElement("div");
bar.hidden = true;   // the attribute alone would lose to the inline display below; show() sets both
bar.style.cssText = "display:none;position:fixed;top:.75rem;left:50%;transform:translateX(-50%);z-index:60;align-items:center;gap:.75rem;width:min(22rem,calc(100vw - 2rem));padding:.5rem .85rem;border-radius:.625rem;font:500 12px/1.5 Geist,system-ui,sans-serif;background:hsl(var(--color-shade-0));color:hsl(var(--color-text-shade-1));border:1px solid hsl(var(--color-shade-5))";
const label = document.createElement("span");
label.style.cssText = "white-space:nowrap";
const track = document.createElement("span");
track.style.cssText = "flex:1;height:3px;border-radius:2px;background:hsl(var(--color-shade-4))";
const fill = document.createElement("span");
fill.style.cssText = "display:block;height:100%;width:0;border-radius:2px;background:hsl(var(--color-primary));transition:width .2s";
track.append(fill);
bar.append(label, track);
document.body.prepend(bar);

function show(word) {
  if (!word) { bar.hidden = true; bar.style.display = "none"; return; }
  bar.hidden = false;
  bar.style.display = "flex";
  label.textContent = word;
  const percent = /(\d+)%/.exec(word);
  fill.style.width = percent ? percent[1] + "%" : "0";
}

const inference = await import(new URL("inference.js", SHELL).href);
inference.engine.onState = show;
inference.engine.onReady = () => show("");
inference.gpuReady().catch((error) => show(error.message));
