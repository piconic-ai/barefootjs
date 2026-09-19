# syntax=docker/dockerfile:1
#
# Build & runtime image for the Laravel example, intended to be executed inside
# a Cloudflare Container. Requires `bun run build` to have been run on the host
# first so dist/ (templates, client JS, styles), lib/ (BarefootJS PHP runtime
# source), vendor/ (composer install, incl. laravel/framework) and
# composer.lock exist alongside the app.

FROM php:8.4-cli
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY artisan composer.json composer.lock ./
COPY bootstrap ./bootstrap
COPY config ./config
COPY routes ./routes
COPY public ./public
COPY app ./app
COPY storage ./storage
COPY lib ./lib
COPY dist ./dist
COPY vendor ./vendor

# Laravel writes its package-discovery cache under bootstrap/cache and the
# compiled Blade templates under storage/framework/views at runtime.
RUN chown -R app:app storage bootstrap/cache

ENV BASE_PATH=/integrations/laravel
ENV APP_ENV=production
# No writable log file in the container; the framework's stderr channel goes
# to the container logs instead (the default `stack`->`single` channel would
# write storage/logs/laravel.log).
ENV LOG_CHANNEL=stderr
# `artisan serve` is the same PHP built-in server integrations/blade runs
# (with Laravel's request handling in front); PHP_CLI_SERVER_WORKERS gives it
# a small worker pool so the SSE stream (/api/ai-chat) doesn't stall other
# in-flight requests -- see App\Support\TodoStore's docstring.
ENV PHP_CLI_SERVER_WORKERS=8
EXPOSE 8080
USER app
# Run the server under an init so the Container's SIGTERM actually stops it
# -- see "Why production images run under tini" in integrations/README.md.
ENTRYPOINT ["tini", "-g", "--"]
# Exec form, so the server is tini's direct child with no shell in between.
# The Cloudflare Container worker probes defaultPort 8080 (container.ts), so
# the listen port is spelled out here rather than expanded from $PORT.
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8080"]
