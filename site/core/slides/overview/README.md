# BarefootJS overview slide deck

Sources for the "BarefootJS overview" slide deck (a few-minute walkthrough), built with
[peitho](https://github.com/mizzy/peitho) and served as a static page at
`https://barefootjs.dev/slides/overview/`.

This is an in-progress prototype, not a polished/final deck.

## Layout

- `deck.md` — the slide script (peitho's markdown-driven deck format).
- `layouts/*.html` — per-slide-kind HTML layouts referenced from `deck.md`.
- `css/base.css` — deck styling.
- `css/0-fonts.css` — the deck's web fonts, embedded as data URIs (generated
  from `fontsrc/`, which is not checked in — see below).
- `assets/hero.mp4` + `assets/hero.jpg` — the cover slide's background video
  and its poster frame. `assets/SOURCES.md` records where they came from and
  their license.
- `component/` — a small Vite project that compiles the deck's interactive
  BarefootJS components (`component/components/*.tsx`) with `@barefootjs/vite`
  and `CSRAdapter`, and bundles the result into a single client script. It
  depends on the monorepo's own `@barefootjs/client`, `@barefootjs/vite`, and
  `@barefootjs/jsx` via `workspace:*`, so the deck always compiles against
  this repo's own compiler and runtime rather than a published npm version.
  `component/mount.ts` finds `<div data-bf="...">` markers that peitho's
  layouts emit and mounts the matching component into them as peitho swaps
  slides in and out of the light-DOM viewer; `component/narration.ts` adds the
  deck's progress bar, slide counter, and headline word-reveal.
- `slide.json` — the page `<title>`.

The build itself is shared by every deck: `site/core/scripts/build-slides.ts`
(`bun run slides:build <slug>`, see `site/core/slides/README.md`).

Not checked in: `fontsrc/` (the raw `.woff2` files and a scratch
`fonts.css`/`google.css` used to *generate* `css/0-fonts.css`) — the deck only
needs the already-embedded `css/0-fonts.css` at runtime, and `component/dist/`
/ `component/node_modules/` (the build script's working output).

## Rebuilding

The build output is **committed** at
`site/core/public/slides/overview/` (peitho's distribution viewer:
`index.html`, `manifest.json`, `peitho.css`, `slides/*.html`, plus
`assets/{hero.mp4,hero.jpg,deck.js}`) — CI has no `peitho` binary, so nothing
rebuilds this deck at deploy time. `bun run build` in `site/core` copies
`public/` (this deck included) straight into `dist/`, which is what Cloudflare
Workers Assets actually serves in production.

To rebuild after changing a source file here, from this directory:

```sh
cd site/core
PEITHO=/path/to/peitho bun run slides:build overview
```

(`peitho` itself is built from https://github.com/mizzy/peitho and is not
part of this repo; point `PEITHO` at wherever you built or installed it. Omit
the argument to build into a local `dist/` instead, for a quick look before
overwriting the committed output.)

Then commit the changed files under `site/core/public/slides/overview/`
alongside your source change.

## Hero media license

`assets/hero.mp4` (7.6 MB, committed) and `assets/hero.jpg` — see
`assets/SOURCES.md` for the source and license (Mixkit Stock Video Free
License; free for commercial use, no attribution required).
