# syntax=docker/dockerfile:1
#
# Build & runtime image for the gin example, intended to be executed inside a
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
# integrations/gin/go.mod (../../packages/adapter-go-template/runtime) resolves.
COPY packages/adapter-go-template/runtime ./packages/adapter-go-template/runtime
COPY integrations/gin/go.mod integrations/gin/go.sum ./integrations/gin/
WORKDIR /src/integrations/gin
RUN go mod download

COPY integrations/gin/*.go ./
ARG TARGETOS
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w" -o /out/gin-server .

FROM alpine:3.19

RUN addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=builder /out/gin-server /app/gin-server
COPY integrations/gin/dist ./dist

ENV BASE_PATH=/integrations/gin
EXPOSE 8081
USER app
CMD ["/app/gin-server"]
