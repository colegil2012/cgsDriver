#!/bin/bash
sleep 5
exec chromium \
  --kiosk \
  --noerrdialogs \
  --disable-infobars \
  --no-first-run \
  --ozone-platform=wayland \
  --password-store=basic \
  --app=file:///home/druid-mobile/celtech/app/index.html
