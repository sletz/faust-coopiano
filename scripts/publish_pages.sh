#!/bin/sh
# Publishes the web version on GitHub Pages (make web-pages): the page of web/
# and the wasm DSPs of web/dsp, at the root of the `gh-pages` branch of
# `origin`, one commit per publication. Pages serves that branch at
# https://<owner>.github.io/<repository>/ once enabled on it (Settings > Pages,
# "Deploy from a branch", gh-pages, root). The commit message names the
# coopiano commit and the faust-rs commit of the checkout holding FAUSTRS (the
# compiler `make web` used; make passes it), `+dirty` when that checkout has
# modified tracked files.
set -e
cd "$(dirname "$0")/.."
for f in voice body body_light; do
  test -f web/dsp/$f.wasm || { echo "web/dsp/$f.wasm missing: run make web" >&2; exit 1; }
done
source_commit=$(git rev-parse --short HEAD)
dirty=$(git status --porcelain -- web dsp | head -1)
faustrs_dir=$(dirname "${FAUSTRS:-../faust-rs/target/release/faust-rs}")
faust_rs_commit=$(git -C "$faustrs_dir" rev-parse --short HEAD 2>/dev/null || echo unknown)
if [ -n "$(git -C "$faustrs_dir" status --porcelain --untracked-files=no 2>/dev/null | head -1)" ]; then
  faust_rs_commit="$faust_rs_commit+dirty"
fi
site=$(mktemp -d)
trap 'git worktree remove --force "$site" 2>/dev/null || rm -rf "$site"' EXIT
git fetch -q origin gh-pages 2>/dev/null || true
if git rev-parse -q --verify origin/gh-pages > /dev/null; then
  rm -rf "$site"
  git worktree add -q -B gh-pages "$site" origin/gh-pages
else
  rm -rf "$site"
  git worktree add -q --detach "$site"
  (cd "$site" && git checkout -q --orphan gh-pages && git rm -rq --cached . && git clean -fdxq)
fi
(cd "$site" && find . -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +)
mkdir -p "$site/dsp"
cp web/index.html web/style.css web/*.js "$site/"
cp web/dsp/*.wasm web/dsp/*.json "$site/dsp/"
touch "$site/.nojekyll"
cd "$site"
git add -A
if git diff --cached --quiet; then
  echo "gh-pages already up to date"
else
  git commit -q -m "Publish the web version from $source_commit, faust-rs $faust_rs_commit${dirty:+ (with uncommitted changes)}"
  git push -q origin gh-pages
  echo "published $(git rev-parse --short HEAD) on gh-pages"
fi
