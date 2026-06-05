# syntax=docker/dockerfile:1
#
# Build & runtime image for the chi example, intended to be executed inside a
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
# integrations/chi/go.mod (../../packages/adapter-go-template/runtime) resolves.
COPY packages/adapter-go-template/runtime ./packages/adapter-go-template/runtime
COPY integrations/chi/go.mod integrations/chi/go.sum ./integrations/chi/
WORKDIR /src/integrations/chi
RUN go mod download

COPY integrations/chi/*.go ./
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/chi-server .

FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /out/chi-server /app/chi-server
COPY integrations/chi/dist ./dist

ENV BASE_PATH=/integrations/chi
EXPOSE 8082
USER app
CMD ["/app/chi-server"]
