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
- `assets/SOURCES.md` — the record of any third-party media shipped with the
  deck (currently none; see "Hero media" below).
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

## Building

The output (`site/core/public/slides/overview/`: peitho's distribution viewer,
`index.html`, `manifest.json`, `peitho.css`, `slides/*.html`, plus
`assets/deck.js`) is not committed. The deploy workflow
installs a pinned peitho release and builds every deck before the site build;
pull requests touching `slides/**` run the same build (`ci-slides.yml`).

To build locally, from `site/core`:

```sh
PEITHO=/path/to/peitho bun run slides:build overview
```

(`peitho` is https://github.com/mizzy/peitho — a prebuilt release or your own
build; point `PEITHO` at it when it is not on PATH.) Then `bun run build` copies
it into `dist/slides/overview/` and `bun run server.tsx` serves it at
`/slides/overview/`.

## Hero media

The deck ships no third-party media. The cover originally used a Mixkit beach
clip recorded here as free for commercial use; the clip's own page turned out
to say "720p version for personal use only" (Mixkit Restricted License), so it
was removed. `assets/SOURCES.md` records this. Any replacement needs a license
that clearly permits public commercial use, recorded there with source URL,
author, license and the date it was checked.
