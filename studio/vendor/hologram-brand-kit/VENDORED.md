# Vendored: Hologram-Technologies/hologram-brand-kit at bce3bdf59de120e125754bfaef437d18aca14673 (develop, 2026-08-28)

Taken verbatim from `brand/` at the commit `BRAND_KIT_REV` pins: `tokens/hologram-tokens.json` (the
source of truth, W3C DTCG: sets core, global, light, dark, hologram-light, hologram-dark), `css/hologram-warm.css`
(the kit's own generated brand layer, kept for comparison; the shell's stylesheets are generated here from
the tokens by `tools/brand_kit.py`), `logos/svg/` (logomark, wordmark, lockup; black and white), `fonts/`
(the web faces: Archivo Medium, SemiBold, Bold; Geist Regular, Medium, SemiBold, Bold; Geist Mono Regular,
Medium; the OFL licences beside them).

Nothing in this folder is edited. `tools/brand_kit.sha256` records every file's digest; the lane's Brand
gate (`python3 tools/brand_kit.py --check`) refuses a build whose vendored files, generated stylesheets or
copied marks and fonts differ, or that names a colour by hand anywhere in the shell.

What the kit lacks, and what this repository does meanwhile, is in `UPSTREAM.md`: a success and a warning
role (the kit's PR #1 is open), glass alpha tokens for surfaces over a photo, a display size scale for hero
titles.

Licences: tokens and component anatomy derived from shadcn/ui (MIT); fonts Geist and Archivo (SIL OFL 1.1).
