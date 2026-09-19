# syntax=docker/dockerfile:1
#
# Build & runtime image for the Django example, intended to be executed
# inside a Cloudflare Container. Requires `bun run build` to have been run
# on the host first so dist/ (templates, client JS, styles) and lib/
# (BarefootJS Python runtime) exist alongside app.py.

FROM python:3.12-slim
RUN useradd -m -r -s /bin/false app
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py ./
COPY lib ./lib
COPY dist ./dist

ENV BASE_PATH=/integrations/django
ENV DJANGO_ENV=production
# The Cloudflare Container worker probes defaultPort 8080 (container.ts);
# without this the app falls back to its dev port 3014 and never comes up.
ENV PORT=8080
EXPOSE 8080
USER app
CMD ["python3", "app.py"]
