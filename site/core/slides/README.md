# Slide decks (`/slides/<slug>/`)

Each directory here is one [peitho](https://github.com/mizzy/peitho) deck, served as a static
page at `https://barefootjs.dev/slides/<slug>/`.

```
slides/<slug>/
├── deck.md        the deck (required)
├── slide.json     { "title": "..." } → the page <title> (optional)
├── layouts/       peitho layouts, picked up automatically (optional)
├── css/           peitho theme, picked up automatically (optional)
├── assets/        media copied into the output's assets/ (optional; *.md such as a
│                  SOURCES.md license record are skipped)
└── component/     a Vite project (barefoot() + CSRAdapter) for live BarefootJS demos
                   embedded via <div data-bf="Name"> mount points in layouts (optional)
```

Build one deck (or `--all`) — `peitho` must be on PATH, or set `PEITHO=/path/to/peitho`:

```sh
cd site/core
bun run slides:build <slug>
```

Two placeholders may be used anywhere in `deck.md`: `%%COMPAT_COMPONENTS%%` and
`%%COMPAT_ADAPTERS%%` are replaced at build time with the component and adapter counts from
`ui/compat.lock.json` (the same source as the landing page's matrix), so a deck never quotes a
hand-typed number that drifts.

The output lands in `public/slides/<slug>/`, which is gitignored: the deploy workflow
(`.github/workflows/deploy.yml`) installs a pinned peitho release and runs
`bun run slides:build --all` before `bun run build`, which copies `public/slides/**` into
`dist/slides/**` for Cloudflare Workers Assets. Pull requests that touch `slides/**` run the
same build in `.github/workflows/ci-slides.yml`, so a deck that no longer builds fails there.
To bump peitho, change `PEITHO_VERSION` and `PEITHO_SHA256` in both workflows.

To add a deck: `peitho new slides/<slug>` (or copy an existing directory), write `deck.md`,
run `bun run slides:build <slug>` to check it locally, and commit the sources only.
