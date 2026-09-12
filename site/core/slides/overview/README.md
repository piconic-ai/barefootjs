# BarefootJS overview slide deck

Sources for the "BarefootJS overview" slide deck (a few-minute walkthrough), built with
[peitho](https://github.com/mizzy/peitho) and served as a static page at
`https://barefootjs.dev/slides/overview/`.

The deck follows the Golden Circle: **Why** (keep the backend you love; the web already
knew how; agents need a check they can run), **How** (declare it and let the compiler wire
it; compile, don't run; only what changed changes; server first; verifiable by humans and
agents), **What** (what ships; the component page; the arcade; one command).

This is an in-progress prototype, not a polished/final deck.

## Layout

- `deck.md` — the slide script (peitho's markdown-driven deck format).
- `layouts/*.html` — per-slide-kind HTML layouts referenced from `deck.md`:
  `cover`, `belief` (one statement + optional sources), `split` (prose + one terminal
  panel), `wire` (what you write / what the compiler emits), `compiler`, `trace`,
  `terminal`, `ships` (six tiles), `showcase` (the composed UI-kit page), `arcade`
  (the full-bleed shooter), `command`, `end`. Layout-specific CSS for the last two lives
  in `css/showcase.css` and `css/arcade.css`.
- `css/base.css` — deck styling.
- `css/0-fonts.css` — the deck's web fonts, embedded as data URIs (generated
  from `fontsrc/`, which is not checked in — see below).
- `assets/hero.mp4` + `assets/hero.jpg` — the cover's looping clip and its
  poster frame (a Pexels clip; see "Hero media" below and `assets/SOURCES.md`).
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
- `css/1-ui-kit.css` — theme tokens, minimal base resets, and UnoCSS utilities
  for the `ui/components/ui/*` components the "62 components, designed after
  shadcn/ui" slide (`layouts/showcase.html` + `component/components/Showcase.tsx`)
  composes. Everything in it is scoped under `.showcase` so it never affects
  any other slide. Generated, not hand-authored — see "Regenerating
  css/1-ui-kit.css" below.

The build itself is shared by every deck: `site/core/scripts/build-slides.ts`
(`bun run slides:build <slug>`, see `site/core/slides/README.md`).

Not checked in: `fontsrc/` (the raw `.woff2` files and a scratch
`fonts.css`/`google.css` used to *generate* `css/0-fonts.css`) — the deck only
needs the already-embedded `css/0-fonts.css` at runtime, and `component/dist/`
/ `component/node_modules/` (the build script's working output).

## Building

The output (`site/core/public/slides/overview/`: peitho's distribution viewer,
`index.html`, `manifest.json`, `peitho.css`, `slides/*.html`, plus
`assets/{hero.mp4,hero.jpg,deck.js}`) is not committed. The deploy workflow
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

## Regenerating css/1-ui-kit.css

`css/1-ui-kit.css` has three parts: (a) a hand-written `.showcase { --token: ... }`
block (the OKLCH design tokens from `site/shared/tokens/tokens.json` +
`site/ui/tokens.json`, with `--primary`/`--primary-foreground` swapped for the
deck's ink/white and `--border`/`--input` darkened so hairlines read on the
deck's paper ground), (b) hand-written base resets scoped under `.showcase`
(box-sizing, button/input font-inherit, heading/list margin resets — wrapped
in `@layer base` so they always lose to the generated utilities in (c),
regardless of selector specificity), and (c) UnoCSS utility classes for the
`ui/components/ui/*` components `Showcase.tsx` composes, which alone is
machine-generated and needs regenerating whenever `Showcase.tsx` or the
composed kit components start using a class it doesn't already emit.

Regenerate (c) from `site/ui` (which has `@unocss/cli` installed), scoping the
scan to exactly the `.tsx` files that matter — the config
(`component/uno.config.ts`) reuses `site/ui/uno.config.ts`'s own theme so
class → `var(--x)` output matches, disables preset-wind4's own preflight
(reset) since (b) above already covers that, scoped, and prefixes every
generated selector with `.showcase ` (its `postprocess` hook) so the bare
utility names UnoCSS emits (`.flex`, `.grid`, `.border`, ...) never apply
outside the showcase:

```sh
cd site/ui && bunx unocss \
  "../../ui/components/ui/{card,button,input,label,checkbox,switch,avatar,badge,separator,slot,icon}/index.tsx" \
  "../core/slides/overview/component/components/Showcase.tsx" \
  -c ../core/slides/overview/component/uno.config.ts \
  --split-css false \
  -o /tmp/1-ui-kit-generated.css
```

Then splice the output's `@property ...` and utility-class sections in place
of the current (c) block in `css/1-ui-kit.css` (drop the `:root, :host { ... }`
theme-variable block the CLI also emits — those are already hand-written into
(a)/(b) above, concretely, to avoid a self-referential `--tracking-tight:
var(--tracking-tight)` the CLI's own theme layer emits, which is only ever
correct when a separate `tokens.css` defining the concrete value loads BEFORE
it, as on the real site — this deck has no such second file). Keep (a) and (b)
in sync by hand if `ui/*/tokens.json` or `site/ui/styles/globals.css`'s
`@layer base` change. Verify visually (a screenshot of the showcase slide)
after regenerating — a new utility class the composed components need but the
scanned file list doesn't cover fails silently (an unstyled element), not
loudly.

## Hero media

The cover's clip is Taryn Elliott's "Waves Crashing on the Shoreline" from
Pexels (video 6624743), used unmodified at 1920x1080 under the Pexels License,
which permits commercial use without attribution (credit is given anyway in
`assets/SOURCES.md`, with the source URL, author, license and the date it was
checked). Any replacement needs a license that clearly permits public commercial
use, recorded there the same way.

An earlier revision used a Mixkit clip that turned out to be under Mixkit's
Restricted License ("720p version for personal use only"); it was removed and
`SOURCES.md` keeps a note of that.
