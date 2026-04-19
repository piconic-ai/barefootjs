# syntax=docker/dockerfile:1
#
# Build & runtime image for the Echo example, intended to be executed inside a
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
# integrations/echo/go.mod (`../../packages/go-template/runtime`) resolves.
COPY packages/go-template/runtime ./packages/go-template/runtime
COPY integrations/echo/go.mod integrations/echo/go.sum ./integrations/echo/

WORKDIR /src/integrations/echo
RUN go mod download

COPY integrations/echo/*.go ./
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/echo-server .

FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /out/echo-server /app/echo-server
COPY integrations/echo/dist ./dist

ENV BASE_PATH=/integrations/echo
EXPOSE 8080
USER app
CMD ["/app/echo-server"]
