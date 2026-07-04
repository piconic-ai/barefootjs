# syntax=docker/dockerfile:1
#
# Build & runtime image for the axum example, intended to be executed inside
# a Cloudflare Container. Requires `bun run build` to have been run on the
# host first so dist/ contains the generated templates, client JS and shared
# styles.
#
# Build context is the repo root (see `image_build_context` in
# wrangler.toml), so paths below are relative to the repository root -- the
# Cargo.toml path dependency on ../../packages/adapter-rust/runtime needs
# that layout mirrored inside the image.
#
# Unlike integrations/gin/Dockerfile's Go cross-compile trick (a single
# native builder host targeting GOOS/GOARCH, avoiding QEMU), Rust's
# toolchain doesn't cross-compile this cheaply without extra target/linker
# setup (`cross`, musl target installs, ...). This Dockerfile instead builds
# NATIVELY per target platform -- the ordinary `docker buildx` multi-platform
# behaviour (no `--platform=$BUILDPLATFORM` override) -- which is simpler and
# more reliable at the cost of one QEMU-emulated build on a foreign host
# architecture. `rust:1-alpine` (musl libc) keeps the final binary
# effectively static, so the runtime stage is a bare `alpine` image.

FROM rust:1-alpine AS builder

RUN apk add --no-cache musl-dev

WORKDIR /src

# Mirror the repo layout inside the image so the path dependency in
# integrations/axum/Cargo.toml (../../packages/adapter-rust/runtime)
# resolves.
COPY packages/adapter-rust/runtime ./packages/adapter-rust/runtime
COPY integrations/axum/Cargo.toml integrations/axum/Cargo.lock ./integrations/axum/
WORKDIR /src/integrations/axum

COPY integrations/axum/src ./src
RUN cargo build --release

FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /src/integrations/axum/target/release/barefootjs-axum-example /app/barefootjs-axum-example
COPY integrations/axum/dist ./dist

ENV BASE_PATH=/integrations/axum
# The Cloudflare Container worker probes defaultPort 8080 (container.ts);
# without this the app falls back to its dev port 3012 and never comes up
# (see integrations/flask/Dockerfile's identical note -- PR #2080 was a
# production outage from missing this).
ENV PORT=8080
EXPOSE 8080
USER app
CMD ["/app/barefootjs-axum-example"]
