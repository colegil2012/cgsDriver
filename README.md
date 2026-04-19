# cgsDriver

Companion driver app for Celtech GS.

## Lightweight scaffold

This repository now includes a minimal browser-based scaffold intended to run in Chromium on a Raspberry Pi image.

### Structure

- `index.html` - main app layout
- `css/style.css` - lightweight mobile-friendly styles
- `app.js` - basic interactivity for stop completion tracking

### Run locally

Open `index.html` in Chromium (or any modern browser).



### Deployment to Raspberry Pi

**Initial Setup:**
```bash
# Clone directly into the target directory
cd /home/druid-mobile
git clone https://github.com/YOUR_USERNAME/cgsDriver.git celtech
cd celtech
chmod +x launch.sh
```

### Run locally

Open `app/index.html` in Chromium (or any modern browser).