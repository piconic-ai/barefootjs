# syntax=docker/dockerfile:1
#
# Build & runtime image for the Blade example, intended to be executed inside a
# Cloudflare Container. Requires `bun run build` to have been run on the host
# first so dist/ (templates, client JS, styles), lib/ (BarefootJS PHP
# runtime source), vendor/ (composer install) and composer.lock exist
# alongside index.php.

FROM php:8.4-cli
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY index.php ./
COPY lib ./lib
COPY dist ./dist
COPY vendor ./vendor
COPY composer.json composer.lock ./

ENV BASE_PATH=/integrations/blade
ENV APP_ENV=production
# PHP_CLI_SERVER_WORKERS gives the built-in server a small worker pool so the
# SSE stream (/api/ai-chat) doesn't stall other in-flight requests -- see
# index.php's top docstring.
ENV PHP_CLI_SERVER_WORKERS=8
EXPOSE 8080
USER app
# Run the server under an init so the Container's SIGTERM actually stops it
# -- see "Why production images run under tini" in integrations/README.md.
ENTRYPOINT ["tini", "-g", "--"]
# Exec form, so the server is tini's direct child with no shell in between.
# The Cloudflare Container worker probes defaultPort 8080 (container.ts), so
# the listen port is spelled out here rather than expanded from $PORT.
CMD ["php", "-S", "0.0.0.0:8080", "index.php"]
