# syntax=docker/dockerfile:1
#
# Build & runtime image for the Mojolicious example, intended to be executed
# inside a Cloudflare Container. Requires `bun run build` to have been run on
# the host first so dist/ (templates, client JS, styles) and lib/ (BarefootJS
# Perl plugin) exist alongside app.pl.

FROM perl:5.38-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends make gcc libc-dev \
 && rm -rf /var/lib/apt/lists/*
# Install CPAN deps into a self-contained prefix so the runtime stage can copy
# a single directory instead of guessing which /usr/local/... paths exist.
RUN cpanm --notest --local-lib=/opt/perl-deps Mojolicious

FROM perl:5.38-slim
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY --from=deps /opt/perl-deps /opt/perl-deps
ENV PERL5LIB=/opt/perl-deps/lib/perl5
ENV PATH=/opt/perl-deps/bin:$PATH

COPY app.pl ./
COPY lib ./lib
COPY dist ./dist

ENV BASE_PATH=/integrations/mojolicious
ENV MOJO_MODE=production
EXPOSE 8080
USER app
CMD ["perl", "app.pl", "daemon", "-l", "http://*:8080"]
