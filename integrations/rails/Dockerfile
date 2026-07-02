# syntax=docker/dockerfile:1
#
# Build & runtime image for the Rails example, intended to be executed inside a
# Cloudflare Container. Requires `bun run build` to have been run on the host
# first so dist/ (templates, client JS, styles) and lib/ (BarefootJS runtime +
# ERB backend) exist alongside the app.

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

COPY config.ru ./
COPY config ./config
COPY app ./app
COPY bin ./bin
COPY lib ./lib
COPY dist ./dist

ENV BASE_PATH=/integrations/rails
ENV RAILS_ENV=production
EXPOSE 8080
USER app
# Puma loads config.ru directly (which boots config/environment) — mirrors the
# Sinatra example's Dockerfile invoking puma directly rather than going through
# `bin/rails server`.
CMD ["bundle", "exec", "puma", "-b", "tcp://0.0.0.0:8080", "-e", "production", "config.ru"]
