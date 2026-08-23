#!/usr/bin/env bash
# ============================================================================
# Triangle Weekend Events — weekly cron entrypoint.
#
# 1. Runs the headless Claude Code task (prompts/weekly.md) to discover, dedup,
#    enrich, and verify this week's events -> data/events.json + itineraries.
# 2. Deterministically validates and builds the site + calendar (a backstop, so
#    publishing never depends on the model remembering to run the build).
# 3. Commits to a branch, opens a PR, arms auto-merge. Cloudflare Pages
#    auto-deploys once CI goes green and the PR lands.
#
# Run from cron in a sandboxed runner. --dangerously-skip-permissions is only
# safe there, never interactively. NOTE: step 3 opens a PR and enables
# auto-merge rather than pushing to main directly. main carries a ruleset
# requiring the `pipeline` and `site` checks, so a direct push is rejected --
# the refresh lands only once CI is green, which keeps malformed data out of
# the deploy branch. Cloudflare Pages still deploys on the resulting push.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"
# cron runs with a thin PATH; make sure node/npm/claude/git/gh are reachable.
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

command -v gh >/dev/null || { echo "run.sh: gh (GitHub CLI) not found on PATH" >&2; exit 1; }

# Step 3 leaves the repo on a per-run branch, so start from a current main
# every week -- otherwise week N+1 would branch off week N's branch.
git checkout main
git pull --ff-only

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

SUMMARY_FILE="data/last_run_summary.txt"
rm -f "$SUMMARY_FILE"

# 1. Discover + dedup + enrich + write data/*.json (Claude Code, headless).
log "starting weekly Claude run"
claude -p "$(cat prompts/weekly.md)" \
  --allowedTools "WebSearch,WebFetch,Read,Write,Edit,Bash" \
  --dangerously-skip-permissions

# 2. Deterministic gate + build (backstop even if the model skipped them).
log "installing deps"
npm install --no-audit --no-fund --silent
npm --prefix site install --no-audit --no-fund --silent

log "validating data"
npm run validate

log "building site + calendar"
npm run build   # validate -> vite build -> copy json -> events.ics

# 3. Commit to a branch, open a PR, let CI gate the merge.
if [[ -z "$(git status --porcelain)" ]]; then
  log "no changes; nothing to commit"
  exit 0
fi

COUNT=$(node -e 'try{const s=require("./data/events.json");console.log((s.events||[]).length)}catch(e){console.log("?")}')
BODY="$( [[ -f "$SUMMARY_FILE" ]] && cat "$SUMMARY_FILE" || echo "events in store: ${COUNT}" )"

# Date + epoch so a same-day re-run gets its own branch instead of colliding.
BRANCH="events/weekly-$(date +%F)-$(date +%s)"
git switch -c "$BRANCH"
git add -A
git commit -m "chore(events): weekly refresh $(date +%F)" -m "$BODY"
git push -u origin "$BRANCH"

gh pr create --title "chore(events): weekly refresh $(date +%F)" --body "$BODY"

# --auto lands it the moment `pipeline` and `site` go green. If CI fails the PR
# just stays open, which is the point: a broken refresh is visible and does not
# deploy. Nothing here merges on red.
gh pr merge --auto --squash

log "done — ${COUNT} events in store; PR opened on ${BRANCH}, auto-merge armed"
