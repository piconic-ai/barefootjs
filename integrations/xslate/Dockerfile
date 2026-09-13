# syntax=docker/dockerfile:1
#
# Build & runtime image for the Text::Xslate example, intended to be executed
# inside a Cloudflare Container. Requires `bun run build` to have been run on
# the host first so dist/ (templates, client JS, styles) and lib/ (BarefootJS
# runtime + Xslate backend) exist alongside app.psgi.

FROM perl:5.40-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends make gcc libc-dev \
 && rm -rf /var/lib/apt/lists/*
# Install CPAN deps into a self-contained prefix the runtime stage copies whole.
# Text::Xslate is XS (needs the compiler above); Starman is the PSGI server
# (prefork, so the SSE routes — AI chat, dev reload — don't block other workers).
# Plack pulls in JSON::MaybeXS -> Cpanel::JSON::XS. CPAN's package index
# currently advertises Cpanel::JSON::XS 4.52 as latest, but that release was
# retracted from the mirror network (its tarball 404s) and the index hasn't
# caught up, so resolving "latest" 404s every time — not mirror flakiness,
# it fails identically on every attempt. Pin the last known-good release
# explicitly so cpanm never tries to resolve/fetch the phantom 4.52.
# The retry loop stays as defense-in-depth against genuine transient
# network hiccups, clearing cpanm's download cache between attempts.
RUN for i in 1 2 3; do \
      cpanm --notest --local-lib=/opt/perl-deps Text::Xslate Cpanel::JSON::XS@4.51 Plack Starman && exit 0; \
      echo "cpanm attempt $i failed, retrying..." >&2; \
      rm -rf /opt/perl-deps ~/.cpanm; \
      sleep 5; \
    done; \
    exit 1

FROM perl:5.40-slim
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY --from=deps /opt/perl-deps /opt/perl-deps
ENV PERL5LIB=/opt/perl-deps/lib/perl5
ENV PATH=/opt/perl-deps/bin:$PATH

COPY app.psgi ./
COPY lib ./lib
COPY dist ./dist

ENV BASE_PATH=/integrations/xslate
ENV PLACK_ENV=production
EXPOSE 8080
USER app
CMD ["starman", "--listen", ":8080", "--workers", "5", "app.psgi"]
