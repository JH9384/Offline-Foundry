// The live frame as one HTML document, assembled from the shell's own files. The frame is served in the
// preview sandbox, whose policy loads nothing from this origin (no 'self'), so everything it needs is
// inline: the brand sheet with its fonts as data URLs, the frame's sheet, the interpreter every app's
// rule module ships, and the frame's script. Pure: the same files give the same bytes, so the frame's
// address (the kappa of these bytes) changes only when the shell does.
export const FONTS = ["fonts/Geist-Regular.woff2", "fonts/Geist-Medium.woff2", "fonts/Geist-SemiBold.woff2", "fonts/Archivo-SemiBold.woff2"];

const scriptSafe = (text) => text.replace(/<\/script/gi, "<\\/script");
const styleSafe = (text) => text.replace(/<\/style/gi, "<\\/style");

/** `fonts` maps a path under the shell to its bytes as base64; an @font-face whose file is not given is dropped. */
export function frameHtml({ brandCss, frameCss, frameJs, interpreter, fonts }) {
  const brand = brandCss.replace(/@font-face\s*\{[^}]*\}\s*/g, (face) => {
    const m = /url\("([^"]+)"\)/.exec(face);
    return m && fonts[m[1]] ? face.replace(m[0], `url("data:font/woff2;base64,${fonts[m[1]]}")`) : "";
  });
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live preview</title>
<style>${styleSafe(brand)}</style>
<style>${styleSafe(frameCss)}</style>
</head><body><div id="trust" aria-live="polite"></div><main><div id="empty">The app appears here as its rules are written.</div><div id="app"></div></main>
<script>${scriptSafe(interpreter)}</script>
<script>${scriptSafe(frameJs)}</script>
</body></html>
`;
}
