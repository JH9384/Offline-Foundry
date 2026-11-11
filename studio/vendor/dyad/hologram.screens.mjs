// hologram-forge (ours, not Dyad's; see VENDORED.md): the screens the shell draws its own way, built only
// from the kit's shadcn/ui components after shadcn's blocks (dashboard-01: an inset sidebar, a site header,
// section cards, tables). SCREENS swaps a Dyad file for ours whole; PATCHES replace one exact passage of a
// Dyad file and refuse the build when the passage is not found, so an upstream change is seen, not missed.
// Dyad's files stay verbatim. The vite config and the typecheck both apply this module.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const slash = (p) => p.replace(/\\/g, "/");

export const SCREENS = {
  "src/components/app-sidebar.tsx": "hologram.screens/AppSidebar.tsx",
  "src/pages/apps.tsx": "hologram.screens/AppsPage.tsx",
};

export const PATCHES = [
  {
    // The page sits in the sidebar's inset, under a site header, as in dashboard-01.
    file: "src/app/layout.tsx",
    from: `import { AppSidebar } from "@/components/app-sidebar";`,
    to: `import { AppSidebar, SiteHeader } from "@/components/app-sidebar";\nimport { SidebarInset } from "@/components/ui/sidebar";`,
  },
  {
    file: "src/app/layout.tsx",
    from: `<SidebarProvider defaultOpen={false}>`,
    to: `<SidebarProvider style={{ "--sidebar-width": "calc(var(--spacing) * 64)", "--header-height": "calc(var(--spacing) * 12)" } as React.CSSProperties}>`,
  },
  {
    file: "src/app/layout.tsx",
    from: `                <div className="flex h-screenish min-w-0 flex-1 flex-col overflow-hidden mt-[var(--layout-title-bar-offset)] border-l border-border bg-background">
                  <SubscriptionStatusBanner />
                  <div
                    id="layout-main-content-container"
                    className="flex min-h-0 w-full flex-1 overflow-x-hidden"
                  >
                    {children}
                  </div>
                </div>`,
    to: `                <SidebarInset className="h-[calc(100svh-(--spacing(4)))] min-w-0 overflow-hidden">
                  <SiteHeader />
                  <SubscriptionStatusBanner />
                  <div
                    id="layout-main-content-container"
                    className="flex min-h-0 w-full flex-1 overflow-x-hidden"
                  >
                    {children}
                  </div>
                </SidebarInset>`,
  },
  {
    // Its items carry a description under the label; Radix's SelectValue shows the chosen item whole, so the
    // trigger names the label alone, as Base UI's showed one line.
    file: "src/components/ZoomSelector.tsx",
    from: `<SelectValue placeholder={t("general.selectZoom")} />`,
    to: `<SelectValue placeholder={t("general.selectZoom")}>{ZOOM_LEVEL_LABELS[currentZoomLevel as ZoomLevel]}</SelectValue>`,
  },
];

/** Our file for a Dyad file the shell replaces whole (absolute paths), or null. */
export function screenFor(file) {
  const rel = slash(path.relative(here, file));
  return SCREENS[rel] ? path.join(here, SCREENS[rel]) : null;
}

/** A Dyad file's source as the shell builds it: ours if replaced, else with its patches applied. */
export function screenSource(file, code) {
  const ours = screenFor(file);
  if (ours) return fs.readFileSync(ours, "utf8");
  const rel = slash(path.relative(here, file));
  let out = code.replace(/\r\n/g, "\n");
  for (const p of PATCHES) {
    if (p.file !== rel) continue;
    if (!out.includes(p.from)) throw new Error(`${rel}: the passage the shell patches was not found:\n${p.from.split("\n")[0]}`);
    out = out.replace(p.from, p.to);
  }
  return out;
}
