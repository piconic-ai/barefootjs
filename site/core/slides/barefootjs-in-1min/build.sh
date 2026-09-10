#!/usr/bin/env sh
# Static build for hosting under a path (e.g. barefootjs.dev/slides/barefootjs-in-1min/).
#   dist/            peitho's distribution viewer (index.html, manifest.json, slides/, peitho.css)
#   dist/assets/     hero.mp4 + hero.jpg (cover) and deck.js (BarefootJS components + deck chrome)
# peitho build rewrites index.html every time, so the <script> tag is injected on every build.
set -eu
OUT=${1:-dist}
PEITHO=${PEITHO:-peitho}

"$PEITHO" build deck.md --out "$OUT"
mkdir -p "$OUT/assets"
cp assets/hero.jpg assets/hero.mp4 "$OUT/assets/"

( cd component && bunx vite build >/dev/null && M=$(ls dist/assets/mount-*.js) && N=$(ls dist/assets/narration-*.js) \
  && printf "import './%s'\nimport './%s'\n" "${M#dist/}" "${N#dist/}" > dist/entry.js \
  && bun build dist/entry.js --bundle --format=esm --minify --outfile=bundle.js >/dev/null )
cp component/bundle.js "$OUT/assets/deck.js"

# inject once, right after <head>
sed -i.bak 's#<head>#<head>\n  <script type="module" src="assets/deck.js"></script>#' "$OUT/index.html"
rm -f "$OUT/index.html.bak"
rm -rf "$OUT/theme-fonts"   # unused: the deck ships its own fonts in css/0-fonts.css (built from fontsrc/)

echo "built $OUT ($(du -sh "$OUT" | cut -f1))"
