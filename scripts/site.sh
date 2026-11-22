#!/usr/bin/env bash
# Build the website folder (_site) and publish it to the gh-pages branch.
#   ./scripts/site.sh prepare   → _site/audio gets the recordings already online (kept between runs)
#   ./scripts/site.sh publish   → copy the app + data into _site and replace gh-pages with it
# gh-pages is replaced every time (one commit, no history), so recordings never pile up in the repo.
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in
  prepare)
    mkdir -p _site/audio
    if git fetch -q origin gh-pages --depth=1 2>/dev/null; then
      git archive FETCH_HEAD audio 2>/dev/null | tar -x -C _site 2>/dev/null || true
    fi
    echo "Recordings kept from last time: $(ls _site/audio | grep -c mp3 || true)"
    ;;
  publish)
    mkdir -p _site
    cp -r index.html manifest.json icon-192.png icon-512.png css js data _site/
    touch _site/.nojekyll
    cd _site
    rm -rf .git
    git init -q -b gh-pages
    git config user.name "news-bot"; git config user.email "news-bot@users.noreply.github.com"
    git add -A
    git commit -q -m "Site $(date -u +%Y-%m-%dT%H:%MZ)"
    git push -q -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" gh-pages
    echo "Published to gh-pages ($(du -sh . | cut -f1))"
    ;;
  *) echo "usage: site.sh prepare|publish"; exit 1 ;;
esac
