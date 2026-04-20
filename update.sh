#!/bin/bash
# =============================================================
# Celtech Kiosk Update Script
# Hard-resets local working copy to match origin/main.
# =============================================================

set -e

APP_DIR="/home/druid-mobile/celtech"
LOG_FILE="/home/druid-mobile/update.log"
BRANCH="main"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "-----------------------------------"
log "Starting Celtech Driver App software update"

if [ ! -d "$APP_DIR/.git" ]; then
    log "ERROR: $APP_DIR is not a git repository. Aborting."
    exit 1
fi

cd "$APP_DIR"

# Wait for network (up to 30 seconds)
log "Waiting for network..."
WAIT=0
until ping -c 1 -W 2 8.8.8.8 &>/dev/null; do
    WAIT=$((WAIT + 2))
    if [ $WAIT -ge 30 ]; then
        log "WARNING: No network after 30s. Skipping update, continuing with existing version."
        exit 0
    fi
    sleep 2
done
log "Network ready after ${WAIT}s."

log "Fetching from origin..."
git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    # Still clean any stray modifications just in case
    if [ -n "$(git status --porcelain)" ]; then
        log "Local modifications detected, resetting to clean state..."
        git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1
    fi
    log "Already up to date ($(git rev-parse --short HEAD)). No update needed."
else
    log "Update available: $(git rev-parse --short HEAD) -> $(git rev-parse --short origin/$BRANCH)"
    # Hard reset discards any local changes and matches remote exactly
    git reset --hard "origin/$BRANCH" >> "$LOG_FILE" 2>&1
    log "Updated to: $(git rev-parse --short HEAD)"
fi

log "Fixing permissions on launch.sh and update.sh"
chmod +x "$APP_DIR/launch.sh"
chmod +x "$APP_DIR/update.sh"

log "Update complete."
log "-----------------------------------"

exit 0