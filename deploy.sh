#!/bin/sh
# One-command deploy to GitHub Pages under your own account. Needs the GitHub CLI (gh), logged in.
# Usage: sh deploy.sh [repo-name]   -> creates <you>/<repo-name>, enables Pages and runs the first build.
set -e
NAME="${1:-taskmarket-live}"
gh repo create "$NAME" --public --source . --push
OWNER="$(gh api user -q .login)"
gh api -X POST "repos/$OWNER/$NAME/pages" -f build_type=workflow >/dev/null 2>&1 || gh api -X PUT "repos/$OWNER/$NAME/pages" -f build_type=workflow >/dev/null
gh workflow run build-and-deploy -R "$OWNER/$NAME"
echo "Deploying. It refreshes every hour. URL: https://$OWNER.github.io/$NAME/"
