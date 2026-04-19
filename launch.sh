#!/bin/bash
sleep 5
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
  --app=file:///home/druid-mobile/celtech/app/index.html
