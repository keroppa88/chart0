#!/usr/bin/env bash
set -euo pipefail
git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git add collector/data data
if git diff --cached --quiet; then
  exit 0
fi
git commit -m "Collect ${1:?market kind required} market data"
for attempt in 1 2 3; do
  if ! git pull --rebase origin main; then
    conflicts="$(git diff --name-only --diff-filter=U)"
    if [ "$conflicts" != "data/version.txt" ]; then
      echo "Rebase failed; refusing to overwrite CSV or other conflicts."
      exit 1
    fi
    # Cache-busting timestamp only. Preserve every CSV change from both commits.
    date +%s > data/version.txt
    git add data/version.txt
    GIT_EDITOR=true git rebase --continue
  fi
  if git push origin HEAD:main; then
    exit 0
  fi
done
echo "Push failed after three attempts."
exit 1
