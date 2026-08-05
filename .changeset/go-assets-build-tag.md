---
"@barefootjs/go-template": patch
---

Split the generated Go asset map across inverted build tags so `vite dev` no longer dirties a tracked file

`@barefootjs/go-template/vite`'s `assets` option writes ONE file
(`bf_assets.go`, tracked in `integrations/{echo,gin,chi,nethttp}`) on
EVERY eager pass, dev or build. A `vite build` bakes content-hashed
production URLs into it; running `vite dev` afterward (or before) baked in
a dev-server-origin URL instead — same file, so either pass rewrote
whatever the other left there, leaving `git status` permanently dirty
after `vite dev` and racing `components.go` (which doesn't churn, because
its content is mode-independent) for "why is this generated file never
stable".

Now split across two build-tagged files declaring the SAME `Assets`
symbol, so exactly one compiles:

| File | Tag | Contents | Tracked |
|---|---|---|---|
| `bf_assets.go` | `//go:build !production` | dev-server URLs | committed |
| `bf_assets_prod.go` | `//go:build production` | hashed build URLs | gitignored |

The untagged default is DEV (inverted from the usual convention on
purpose): dev URLs carry no content hash, so the dev-tagged file is
stable — safe, and meant, to commit — while the hashed prod URLs churn
every build, so THAT file is gitignored instead. This also means a fresh
clone with no prior `vite build` still compiles (`go run .` "just
works"); producing the tagged production binary is a deliberate `go build
-tags production .`.

Inverting the tag inverts the accident it guards against: previously you
could mistakenly ship a dev-tagged build; now you can forget `-tags
production` and ship one. Forgetting is the likelier mistake and fails
silently (the binary compiles, starts, and serves everything except a
`<script src="http://localhost:5173/...">` that 404s in front of real
users), so `packages/adapter-go-template/runtime/bfdev`'s new
`GuardAssets(Assets)` — called once at startup in each of the four Go
integrations' `main()` — panics immediately if the process is NOT in dev
(`bfdev.IsDevDefault()` false) but `Assets` still holds a dev-origin URL,
the only way that combination can arise. A panic, not a logged error,
because the alternative is silently serving a broken app indefinitely
with no other symptom to catch it on; failing the deploy immediately is
the "sound-or-loud" trade this whole split exists to enforce.

Every call site that runs a Go integration in production shape (`APP_ENV`
unset, template cache on) needed the tag added: all four
`playwright.config.ts` `webServer.command`s and all four `Dockerfile`s'
`go build`. The `docker-compose.yml` dev services and each `.air.toml`
(both already set `APP_ENV=development`, both already build untagged) are
correctly untouched — the untagged default IS their dev build now.
