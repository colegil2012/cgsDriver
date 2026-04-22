#!/bin/bash
sleep 5

# Use a dedicated profile directory so our permission preferences stick
CHROMIUM_PROFILE="/home/druid-mobile/.config/celtech-chromium"
mkdir -p "$CHROMIUM_PROFILE/Default"

# Pre-grant geolocation permission for file:// origin so Chromium doesn't prompt
PREFS_FILE="$CHROMIUM_PROFILE/Default/Preferences"
if [ ! -f "$PREFS_FILE" ] || ! grep -q "geolocation" "$PREFS_FILE" 2>/dev/null; then
cat > "$PREFS_FILE" <<'EOF'
{
  "profile": {
    "content_settings": {
      "exceptions": {
        "geolocation": {
          "file:///,*": {
            "last_modified": "13300000000000000",
            "setting": 1
          }
        }
      }
    },
    "default_content_setting_values": {
      "geolocation": 1
    },
    "exit_type": "Normal",
    "exited_cleanly": true
  }
}
EOF
fi

exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --ozone-platform=wayland \
  --password-store=basic \
  --allow-file-access-from-files \
  --enable-features=UseOzonePlatform \
  --touch-events=enabled \
  --force-device-scale-factor=1 \
  --disable-session-crashed-bubble \
  --disable-popup-blocking \
  --user-data-dir="$CHROMIUM_PROFILE" \
  --app=file:///home/druid-mobile/celtech/app/index.html