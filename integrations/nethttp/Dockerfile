# syntax=docker/dockerfile:1
#
# Build & runtime image for the nethttp example, intended to be executed inside a
# Cloudflare Container. Requires `bun run build` to have been run on the host
# first so dist/ contains the generated templates, client JS and shared styles.
#
# Build context is the repo root (see `image_build_context` in wrangler.toml),
# so paths below are relative to the repository root.

# Run the Go toolchain natively on the builder host and cross-compile to the
# target platform. Avoids QEMU emulation, which segfaults the Go compiler when
# building linux/amd64 on arm64 hosts (Apple Silicon).
FROM --platform=$BUILDPLATFORM golang:1.25-alpine AS builder

WORKDIR /src

# Mirror the repo layout inside the image so the `replace` directive in
# integrations/nethttp/go.mod (../../packages/adapter-go-template/runtime) resolves.
COPY packages/adapter-go-template/runtime ./packages/adapter-go-template/runtime
COPY integrations/nethttp/go.mod ./integrations/nethttp/
WORKDIR /src/integrations/nethttp

COPY integrations/nethttp/*.go ./
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/nethttp-server .

FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /out/nethttp-server /app/nethttp-server
COPY integrations/nethttp/dist ./dist

ENV BASE_PATH=/integrations/nethttp
EXPOSE 8083
USER app
CMD ["/app/nethttp-server"]
