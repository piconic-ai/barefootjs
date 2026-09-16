# syntax=docker/dockerfile:1
#
# Build & runtime image for the Spring Boot example, intended to be executed
# inside a Cloudflare Container.
#
# Build context is the repo root (see `image_build_context` in
# wrangler.toml), so paths below are relative to the repository root -- the
# Gradle composite-build path in integrations/spring/settings.gradle.kts
# (../../packages/adapter-pebble/java) needs that layout mirrored inside the
# image, same rationale as integrations/axum's Cargo.toml path dependency.
#
# Three stages: (1) Bun/Vite compiles the JSX components to .peb templates +
# client JS bundle + shared styles, (2) Gradle builds the Spring Boot fat jar
# against those templates (bootJar packages src/main/resources/** into the
# jar too, but the app reads templates from a plain filesystem path via
# Pebble's FileLoader -- see BfContext's docstring -- so the loose files
# staged in the runtime stage below are what actually get read at request
# time), (3) a slim JRE-only image runs the jar.

FROM oven/bun:1 AS assets

WORKDIR /src

# Mirror just enough of the workspace for `bun install` to resolve the
# workspace: dependencies this integration needs (@barefootjs/pebble,
# @barefootjs/vite, @barefootjs/client, @barefootjs/router, the shared
# integrations package) without copying every OTHER integration's node_modules
# footprint into this layer. tsconfig.json is required too, not just for
# `bun install`: integrations/shared/tsconfig.json's `extends:
# "../../tsconfig.json"` resolves relative to the repo root, and Vite's
# esbuild transform fails outright without it (missing here caused a real
# production deploy failure -- #3024).
COPY package.json bun.lock tsconfig.json ./
COPY packages ./packages
COPY integrations/shared ./integrations/shared
COPY integrations/spring ./integrations/spring
RUN bun install --frozen-lockfile

WORKDIR /src/integrations/spring
RUN bun run build

FROM gradle:8.14-jdk21 AS builder

WORKDIR /src

# Mirror the repo layout inside the image so the composite-build path in
# integrations/spring/settings.gradle.kts (../../packages/adapter-pebble/java)
# resolves.
COPY packages/adapter-pebble/java ./packages/adapter-pebble/java
COPY integrations/spring/build.gradle.kts integrations/spring/settings.gradle.kts ./integrations/spring/
WORKDIR /src/integrations/spring

# The compiled templates + manifest (written by the `assets` stage into
# src/main/resources/templates, a SOURCE directory from Gradle's point of
# view) and the client asset map / blog data (dist/) must both be present
# before `gradle bootJar` runs -- the former gets packaged (redundantly,
# but harmlessly -- see the file header) into the jar's resources; the
# latter is read straight off disk by BfContext at startup either way.
COPY --from=assets /src/integrations/spring/src ./src
COPY --from=assets /src/integrations/spring/dist ./dist
RUN gradle bootJar --no-daemon

FROM eclipse-temurin:21-jre

RUN groupadd -r app && useradd -r -g app app
WORKDIR /app

# Preserve the SAME relative layout dev uses (`cd integrations/spring &&
# gradle bootRun`) so BfContext's `Path.of("src/main/resources/templates")`
# resolves identically in both environments with no separate prod code path.
COPY --from=builder /src/integrations/spring/src/main/resources/templates ./src/main/resources/templates
COPY --from=assets /src/integrations/spring/dist ./dist
COPY --from=builder /src/integrations/spring/build/libs/*.jar ./app.jar

ENV BASE_PATH=/integrations/spring
# The Cloudflare Container worker probes defaultPort 8080 (container.ts);
# Spring Boot's own default server.port is already 8080 (see
# application.properties), so no PORT override is needed here -- unlike
# integrations/axum/gin, whose dev port differs from their framework's
# default. Set explicitly anyway for the same reason integrations/flask's
# Dockerfile documents (PR #2080 was a production outage from a missing
# explicit port): a future change to the dev default must not silently
# break the container without this line calling it out.
ENV PORT=8080
EXPOSE 8080
USER app
CMD ["java", "-jar", "/app/app.jar"]
