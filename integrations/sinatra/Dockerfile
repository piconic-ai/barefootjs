# syntax=docker/dockerfile:1
#
# Build & runtime image for the Sinatra example, intended to be executed
# inside a Cloudflare Container. Requires `bun run build` to have been run on
# the host first so dist/ (templates, client JS, styles) and lib/ (BarefootJS
# runtime + ERB backend) exist alongside app.rb.

FROM ruby:3.3-slim AS deps
# Puma's nio4r dependency is a C extension; build-essential compiles it, then
# the runtime stage below copies the already-built gems whole (no compiler in
# the final image).
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY Gemfile Gemfile.lock ./
RUN bundle config set --local without 'development' \
 && bundle config set --local path /usr/local/bundle \
 && bundle install

FROM ruby:3.3-slim
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY --from=deps /usr/local/bundle /usr/local/bundle
ENV BUNDLE_PATH=/usr/local/bundle
COPY Gemfile Gemfile.lock ./

COPY app.rb config.ru ./
COPY lib ./lib
COPY dist ./dist

ENV BASE_PATH=/integrations/sinatra
ENV RACK_ENV=production
EXPOSE 8080
USER app
# Puma loads config.ru directly (a plain Rack app, no `bundle exec rackup`
# needed) — mirrors the Xslate example's Dockerfile invoking `starman`
# directly rather than going through `plackup`.
CMD ["bundle", "exec", "puma", "-b", "tcp://0.0.0.0:8080", "-e", "production", "config.ru"]
