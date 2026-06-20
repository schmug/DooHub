#!/usr/bin/env bash
# ============================================================================
# Triangle Weekend Events — weekly cron entrypoint.
#
# 1. Runs the headless Claude Code task (prompts/weekly.md) to discover, dedup,
#    enrich, and verify this week's events -> data/events.json + itineraries.
# 2. Deterministically validates and builds the site + calendar (a backstop, so
#    publishing never depends on the model remembering to run the build).
# 3. Commits and pushes. Cloudflare Pages auto-deploys on push.
#
# Run from cron in a sandboxed runner. --dangerously-skip-permissions is only
# safe there, never interactively. NOTE: this pushes directly to the deploy
# branch by design (an automated content pipeline), which intentionally differs
# from the usual "open a PR" default — see README.
# ============================================================================
set -euo pipefail

cd "$(dirname "$0")"
# cron runs with a thin PATH; make sure node/npm/claude/git are reachable.
export PATH="$PATH:/usr/local/bin:/opt/homebrew/bin"

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

# 3. Commit + push (Cloudflare Pages deploys on push).
if [[ -z "$(git status --porcelain)" ]]; then
  log "no changes; nothing to commit"
  exit 0
fi

COUNT=$(node -e 'try{const s=require("./data/events.json");console.log((s.events||[]).length)}catch(e){console.log("?")}')
BODY="$( [[ -f "$SUMMARY_FILE" ]] && cat "$SUMMARY_FILE" || echo "events in store: ${COUNT}" )"

git add -A
git commit -m "chore(events): weekly refresh $(date +%F)" -m "$BODY"
git push
log "done — ${COUNT} events in store"
