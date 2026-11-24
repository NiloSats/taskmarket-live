#!/bin/sh
# Rebuild and publish dist/ to the gh-pages branch (for hosts that refresh from a scheduler instead of Actions).
# Usage: SITE_URL=https://<owner>.github.io/<repo>/ REMOTE=<git remote url> sh publish-branch.sh
set -e
cd "$(dirname "$0")"
node build.mjs
python og.py 2>/dev/null || python3 og.py
touch dist/.nojekyll
TMP="$(mktemp -d)"
cp -r dist/. "$TMP"
cd "$TMP"
git init -q -b gh-pages
git add -A
git -c user.name="${GIT_NAME:-taskmarket-live}" -c user.email="${GIT_EMAIL:-taskmarket-live@users.noreply.github.com}" commit -qm "data as of $(date -u +%Y-%m-%dT%H:%MZ)"
git push -qf "$REMOTE" gh-pages
cd - >/dev/null && rm -rf "$TMP"
echo "published gh-pages"
