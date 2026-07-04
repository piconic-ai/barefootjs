# syntax=docker/dockerfile:1
#
# Build & runtime image for the PHP example, intended to be executed inside a
# Cloudflare Container. Requires `bun run build` to have been run on the host
# first so dist/ (templates, client JS, styles), lib/ (BarefootJS PHP
# runtime source), vendor/ (composer install) and composer.lock exist
# alongside index.php.

FROM php:8.4-cli
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY index.php ./
COPY lib ./lib
COPY dist ./dist
COPY vendor ./vendor
COPY composer.json composer.lock ./

ENV BASE_PATH=/integrations/php
ENV APP_ENV=production
# The Cloudflare Container worker probes defaultPort 8080 (container.ts);
# without this the app falls back to its dev port 3012 and never comes up.
ENV PORT=8080
EXPOSE 8080
USER app
# PHP_CLI_SERVER_WORKERS gives the built-in server a small worker pool so the
# SSE stream (/api/ai-chat) doesn't stall other in-flight requests -- see
# index.php's top docstring.
CMD ["sh", "-c", "PHP_CLI_SERVER_WORKERS=8 php -S 0.0.0.0:${PORT} index.php"]
