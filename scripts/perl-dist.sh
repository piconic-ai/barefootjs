#!/usr/bin/env bash
#
# Build / test a CPAN distribution from a Perl package nested in this monorepo,
# using Minilla.
#
# Why the indirection: Minilla assumes the distribution root IS the git
# repository root (it locates the project via `git rev-parse --show-toplevel`).
# That does not hold for packages nested under packages/ in this JS monorepo —
# the toplevel is the monorepo root. So we assemble each dist's CPAN-relevant
# files (lib/, t/, and the dist metadata) into an isolated temp dir with its
# own throwaway git repo, and run `minil` there. The npm/TS sources in the
# package (package.json, tsconfig.json, src/, *.ts) are never copied, so the
# CPAN tarball stays clean.
#
# Usage:
#   scripts/perl-dist.sh <package-dir> [minil-subcommand...]   (default: test)
#
# Examples:
#   scripts/perl-dist.sh packages/adapter-perl test
#   scripts/perl-dist.sh packages/adapter-perl dist
#
set -euo pipefail

pkg="${1:?usage: perl-dist.sh <package-dir> [minil-subcommand...]}"
shift || true

src="$(cd "$pkg" && pwd)"
[ -f "$src/minil.toml" ] || { echo "error: no minil.toml in $src" >&2; exit 1; }

command -v minil >/dev/null 2>&1 || { echo "error: minil not found (cpanm Minilla)" >&2; exit 1; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Copy only CPAN-relevant files — never the npm/TS sources.
cp -R "$src/lib" "$work/lib"
[ -d "$src/t" ] && cp -R "$src/t" "$work/t"
for f in minil.toml cpanfile Changes README.md README.pod LICENSE; do
  [ -f "$src/$f" ] && cp "$src/$f" "$work/$f"
done

# Minilla lists LICENSE in every MANIFEST but only writes it at `minil new`,
# not during `dist`. Supply the repo's single MIT LICENSE so `dist` can pack it.
repo_root="$(git -C "$src" rev-parse --show-toplevel)"
if [ ! -f "$work/LICENSE" ] && [ -f "$repo_root/LICENSE" ]; then
  cp "$repo_root/LICENSE" "$work/LICENSE"
fi

cd "$work"
git init -q
git add -A
git -c user.email='dist@barefootjs.local' -c user.name='barefootjs-dist' \
    -c commit.gpgsign=false -c tag.gpgsign=false commit -qm 'assemble dist'

minil "${@:-test}"

# If a tarball was produced (e.g. `dist`), surface it next to the source.
shopt -s nullglob
for tgz in ./*.tar.gz; do
  cp "$tgz" "$src/" && echo "dist tarball -> $src/$(basename "$tgz")"
done
