# Trace Racer

A racing game. Draw your racing line in one stroke, then watch your car drive it against four rivals.
Your drawing speed becomes the car's speed. Four tracks (asphalt, gravel, ice, rallycross with jumps), ghost cars, and share links for a line.
Live at https://traceracer.tomtebo.org/. It installs as a PWA (Add to Home Screen).

## Development

    npm install
    npm run dev       # dev server
    npm run build     # build to dist/
    npm run preview   # serve dist/

## Files

- `index.html`: page markup
- `src/main.js`: game logic, input and rendering
- `src/style.css`: styles
- `scripts/icon.svg`: source of the app icon and favicon
- `scripts/render-icons.mjs`: `npm run icons` renders the icon to the PNG files in `public/` (needs a Playwright Chromium)
- `public/manifest.webmanifest`: PWA manifest
- `art/`: the track and car art. `art/BRIEF.md` is the brief, `art/README.md` says how the art was made,
  and `art/reference/` holds the track geometry it must match.
- `scripts/export-art.py`: `npm run art` copies the art to `public/art/`, with the track images as WebP

Each track is stretched to fill a 1920x1080 frame (16:9). The track image covers that frame, and a repeating
ground texture fills the rest of the screen on wider or taller screens. If you change a track's control points,
the art no longer matches the road, so render new references and redo that track's art.

## Deploy

A push to `main` deploys the site. The GitHub Action (`.github/workflows/deploy.yml`) builds it and pushes `dist/` to the `deploy` branch.
The push to `deploy` fires the repository webhook. The hook `update-trace-racer` on ludo.tomtebo.org then runs `deploy/update-site.sh`,
which copies the branch to `/home/staffan/sites/traceracer.tomtebo.org`. The update log is `/var/log/webhook-updates.log`.

`npm run deploy` builds locally and copies `dist/` with rsync, without GitHub.

One-time server setup: `deploy/setup-server.sh` (nginx site and TLS certificate) and `deploy/setup-webhook.sh` (the hook).
