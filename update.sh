#!/bin/bash
# =============================================================
# Celtech Kiosk Update Script
# /home/druid-mobile/celtech/update.sh
#
# Pulls latest version from git main branch and fixes permissions.
# Safe to run manually or automatically on boot.
# =============================================================

set -e  # Exit immediately on any error

APP_DIR="/home/druid-mobile/celtech"
LOG_FILE="/home/druid-mobile/update.log"
BRANCH="main"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "-----------------------------------"
log "Starting Celtech Driver App software update"

# Check we're in a git repo
if [ ! -d "$APP_DIR/.git" ]; then
    log "ERROR: $APP_DIR is not a git repository. Aborting."
    exit 1
fi

cd "$APP_DIR"

# Check for network connectivity before attempting pull
log "Checking network..."
if ! ping -c 1 -W 5 8.8.8.8 &>/dev/null; then
    log "WARNING: No network connectivity. Skipping update, continuing with existing version."
    exit 0
fi

# Fetch and pull latest from main
log "Fetching from origin..."
git fetch origin "$BRANCH" >> "$LOG_FILE" 2>&1

LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse "origin/$BRANCH")

if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date ($(git rev-parse --short HEAD)). No update needed."
else
    log "Update available: $(git rev-parse --short HEAD) -> $(git rev-parse --short origin/$BRANCH)"
    git pull origin "$BRANCH" >> "$LOG_FILE" 2>&1
    log "Updated to: $(git rev-parse --short HEAD)"
fi

# Always fix permissions regardless of whether an update occurred
log "Fixing permissions on launch.sh..."
chmod +x "$APP_DIR/launch.sh"

log "Update complete."
log "-----------------------------------"

exit 0
