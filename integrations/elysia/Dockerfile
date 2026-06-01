# syntax=docker/dockerfile:1
#
# Runtime image for the Elysia example, executed inside a Cloudflare Container.
# Requires `bun run build` to have been run on the host first so dist/ contains
# the bundled server (`dist/server.js`, with the SSR templates + manifest
# inlined) and the browser bundles (`dist/components/*.js`).
#
# Build context is the repo root (see `image_build_context` in wrangler.toml),
# so paths below are relative to the repository root. Only the bundle and the
# static assets ship — no node_modules, no source — so the image stays small.

FROM oven/bun:1.3-alpine

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

# Bundled server (self-contained: Elysia, hono/jsx, @barefootjs/*, the compiled
# components and the build manifest are all inlined by `bun build`).
COPY integrations/elysia/dist/server.js ./server.js
# Browser assets served at runtime: barefoot.js + *.client.js (+ maps).
COPY integrations/elysia/dist/components ./assets/components
# Demo stylesheets + logo.
COPY integrations/shared/styles ./assets/styles

ENV BASE_PATH=/integrations/elysia
ENV PORT=3005
# Point the static handlers at the copied assets (the bundle's import.meta.dir
# no longer matches the source layout).
ENV BF_COMPONENTS_DIR=/app/assets/components
ENV BF_STYLES_DIR=/app/assets/styles

EXPOSE 3005
USER app
CMD ["bun", "run", "server.js"]
