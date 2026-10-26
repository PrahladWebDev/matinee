# Matinee: your personal streaming site (MERN)

React + Express + MongoDB + Redis. Netflix-style player, folders, admin uploads, random play.

**Features**
- Custom player: seek bar with buffered ranges and hover time, ±10s, volume, speed, fullscreen, mini-player (PiP), keyboard shortcuts, double-tap to skip on phones, resume where you left off, "Up next" countdown, fullscreen stays on between episodes
- Instant start and seeking: the server streams with HTTP Range requests, and nginx can send the file directly
- Redis caches all library queries (falls back to the DB if Redis is down)
- Home rows per folder, Continue watching, search, nested folders (Show / Season 1 / …)
- 🎲 Random: navbar "Surprise me", per-folder random, and "when this ends → next / random / stop"
- Admin: create folders, upload many files with progress and editable names, upload a whole folder tree, rename/move/delete, and **Scan library** for files you copied straight to the server

## Run locally
```bash
# need: Node 18+, MongoDB, Redis (optional), ffmpeg (optional, for thumbnails/durations)
cd server && cp .env.example .env && npm install     # edit .env (MEDIA_ROOT=./media is fine locally)
npm run dev                                          # API on :5000
cd ../client && npm install && npm run dev           # site on http://localhost:5173
```

## Deploy on the VPS
Follow **MATINEE_COMPLETE_DEPLOYMENT_GUIDE.md** (Redis reuse, `.env`, PM2 via the root `ecosystem.config.js` on port 5009, Nginx, SSL, GitHub Actions in `.github/workflows/deploy.yml`).
Don't change Redis `maxmemory-policy` if other projects share the instance. Matinee only uses keys starting with `mt:`.

## Adding videos
1. **Browser:** Admin → Upload. Choose a destination folder, add files or a whole folder, edit the names, upload.
2. **Big batches (faster):** copy straight to the server, then Admin → **Scan library**.
   `rsync -avP ./Friends/ user@your-server:/var/media/matinee/Friends/`
   Folders become site folders and files become videos.

## No-buffering checklist
- Use **MP4 (H.264 + AAC) with the index at the front**. Run `deploy/optimize.sh /var/media/matinee` once; it remuxes everything without quality loss where possible. MKV and HEVC files often won't play in browsers.
- `USE_NGINX_ACCEL=true` makes nginx serve the files directly.
- The player prefetches the start of the next episode at 80%.
- Real-time speed is limited by your VPS upload bandwidth: roughly 5 Mbit/s per 1080p stream.

## Keyboard shortcuts
`Space/K` play · `J/L` ±10s · `←/→` ±5s · `↑/↓` volume · `M` mute · `F` fullscreen · `I` mini-player · `N/P` next/previous · `0-9` jump to % · `<` `>` speed

## Notes
- Login is required by default (`PUBLIC_BROWSING=false`), so your library stays private. Keep it that way if the content isn't yours to share.
- Watch history and resume positions are stored per browser (localStorage).
- Deleting a folder or video in Admin deletes the actual files.
