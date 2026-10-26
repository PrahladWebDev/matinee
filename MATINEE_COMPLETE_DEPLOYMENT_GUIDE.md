# Matinee — Complete Deployment Guide
### Site + API: matinee.prahladsingh.in (one domain, API under `/api`)

Different shape from your other projects, worth reading Part 0 before starting:

- **Backend is plain Express (ESM)**, run with `node src/index.js` under PM2 on port **`5009`**. Same idea as ShareVault / School ERP.
- **Frontend is a Vite SPA**, so `npm run build` gives a static `client/dist/` that Nginx serves directly (like your other React apps). No second Node process.
- **One domain, no `api.` subdomain.** Login uses an httpOnly cookie, which is simplest when site and API share the same origin. Nginx sends `/api/*` to Node and everything else to `dist/`. So: **one DNS record, one server block, no CORS config**.
- **Videos live on disk, not in Mongo and not in git.** They go in `/var/media/matinee/` (folders there = folders on the site). Mongo stores only metadata (title, folder, duration). Check disk space before you start.
- **Nginx streams the videos, not Node.** With `USE_NGINX_ACCEL=true`, Node only checks your login cookie and hands the file to Nginx (`X-Accel-Redirect`). That is what gives instant seeking with no buffering.
- **Redis is shared** with Assessment Platform and Clipboard Cloud. Matinee only touches keys starting with `mt:`. **Do not change `maxmemory` / `maxmemory-policy` in `redis.conf`**, since that could make Redis evict other projects' keys. Matinee still works if Redis is down (it falls back to Mongo), but you want it on.
- **MongoDB is required to boot.** Reuse your Atlas cluster with a new database name.
- **The CI/CD workflow builds directly on the VPS** (same as Clipboard Cloud), so a deploy briefly uses extra CPU/RAM while `vite build` runs.
- **Bandwidth is the real limit.** Each 1080p viewer pulls roughly 5 Mbit/s from the VPS, so check your Bluehost bandwidth cap.

Ports in use on this VPS so far: ShareVault `5000`, GitHub Analyzer `5001`, Codebase Detective `4005`, Zip Router `5002`, Assessment Platform `5003`, InterviewVault `5004`, BrainVault `5005`, School ERP `5006`, MythLok `5007`, Clipboard Cloud `5008` (+ its Next.js on `3000`). Matinee uses **`5009`**. Confirm it's free:

```bash
sudo lsof -i :5009
```

Run everything over SSH:

```bash
ssh prahlad@50.6.44.245
```

---

# PART 1 — Prerequisites on the VPS

### 1.1 Redis: reuse the existing install

```bash
sudo systemctl status redis-server
redis-cli ping
```

(Add `-a YOUR_REDIS_PASSWORD` before `ping` if you set one.) Should reply `PONG`.

### 1.2 ffmpeg (thumbnails + durations)

```bash
ffmpeg -version | head -1
```

If that printed nothing:

```bash
sudo apt install -y ffmpeg
```

The site works without ffmpeg, but you'd get no thumbnails and no video lengths.

### 1.3 Node version and disk space

```bash
node -v        # must be v18 or newer
df -h /var     # how much room you have for videos
```

### 1.4 Media folder

```bash
sudo mkdir -p /var/media/matinee
sudo chown -R prahlad:prahlad /var/media/matinee
sudo chmod o+rx /var/media /var/media/matinee
```

(The last line lets Nginx's `www-data` user read the videos.)

CHECK:

```bash
ls -ld /var/media /var/media/matinee
```

Both should show `drwxr-xr-x`.

---

# PART 2 — Get the project onto the VPS

From your **local machine**, unzip `matinee.zip`, then push it to a new GitHub repo (the zip already contains `.gitignore`, `ecosystem.config.js` and `.github/workflows/deploy.yml`):

```bash
cd matinee
git init && git add . && git commit -m "Matinee"
git branch -M main
git remote add origin https://github.com/PrahladWebDev/matinee.git
git push -u origin main
```

(Create the empty `matinee` repo on GitHub first, and replace the URL if yours differs.)

Then on the **VPS**:

```bash
sudo mkdir -p /var/www/projects
sudo chown -R prahlad:prahlad /var/www/projects

cd /var/www/projects
git clone https://github.com/PrahladWebDev/matinee.git matinee
```

CHECK:

```bash
ls -a /var/www/projects/matinee
```

Should show `server/`, `client/`, `deploy/`, `ecosystem.config.js`, `.github/`, `MATINEE_COMPLETE_DEPLOYMENT_GUIDE.md`.

---

# PART 3 — Backend: the complete .env file

```bash
cd /var/www/projects/matinee/server
nano .env
```

Paste this, then fill in every `<...>`:

```bash
# ── Server ──────────────────────────────────────────────
PORT=5009

# ── MongoDB Atlas ───────────────────────────────────────
# Required to boot. Reuse your existing cluster, new database name.
# Make sure the VPS IP (50.6.44.245) is allowed in Atlas → Network Access.
MONGO_URI=<paste your Atlas connection string here, ending in /matinee>

# ── Redis (same instance as the other projects) ─────────
# With password:    redis://:YOUR_PASSWORD@127.0.0.1:6379
# Without password: redis://127.0.0.1:6379
# Special characters in the password must be URL-encoded (@ -> %40, # -> %23, / -> %2F)
REDIS_URL=redis://:<your-redis-password>@127.0.0.1:6379
CACHE_TTL=3600

# ── Videos on disk ──────────────────────────────────────
MEDIA_ROOT=/var/media/matinee
# Nginx streams the files (Part 6). Node only checks login.
USE_NGINX_ACCEL=true

# ── Login (single account: you) ─────────────────────────
ADMIN_USER=admin
ADMIN_PASSWORD=<choose a strong password>
# Generate with: openssl rand -base64 32
JWT_SECRET=<paste generated value here>

# false = login needed to watch (recommended). true = anyone can watch.
PUBLIC_BROWSING=false
# Switch to true right after SSL is set up (Part 7)
COOKIE_SECURE=false
```

Generate the JWT secret right now:

```bash
openssl rand -base64 32
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`. Lock it down:

```bash
chmod 600 .env
```

CHECK — confirm nothing left unfilled:

```bash
grep -n "<" .env
```

Must print nothing. (If you have no Redis password, use the "without password" `REDIS_URL` instead.)

> The server refuses to start in production while `ADMIN_PASSWORD` or `JWT_SECRET` are still the defaults. That is intentional.

---

# PART 4 — Build and start

```bash
cd /var/www/projects/matinee/server
npm ci --omit=dev

cd ../client
npm ci
npm run build
```

CHECK the build output:

```bash
ls /var/www/projects/matinee/client/dist
```

Should show `index.html` and `assets/`.

Start the backend from the project root:

```bash
cd /var/www/projects/matinee
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

Run the printed `sudo env PATH=...` command from `pm2 startup`, unless you've already done this once for another project on this VPS.

CHECK:

```bash
pm2 logs matinee-api --lines 30
```

Should show `MongoDB connected`, `Redis connected` and `Matinee API on :5009  media: /var/media/matinee`. Repeated Mongo errors mean `MONGO_URI` or the Atlas IP allowlist is wrong. Then:

```bash
curl http://localhost:5009/api/auth/me
```

Should return `{"authenticated":false,"publicBrowsing":false}`.

---

# PART 5 — DNS

At your domain registrar for `prahladsingh.in`, add one A record:

| Type | Host | Value |
|---|---|---|
| A | matinee | 50.6.44.245 |

Check propagation:

```bash
dig +short matinee.prahladsingh.in
```

---

# PART 6 — Nginx (static React build + API proxy + direct video streaming)

```bash
sudo nano /etc/nginx/sites-available/matinee.prahladsingh.in
```

```nginx
server {
    listen 80;
    server_name matinee.prahladsingh.in;

    # No upload size limit (videos are big)
    client_max_body_size 0;

    gzip on;
    gzip_types application/json text/css application/javascript image/svg+xml;

    # React build (static)
    root /var/www/projects/matinee/client/dist;

    # Videos: Node checks the login cookie, then Nginx sends the file itself
    # (sendfile + native Range support = instant start and seeking)
    location /_media/ {
        internal;
        alias /var/media/matinee/;      # must match MEDIA_ROOT, keep the trailing slash
        sendfile on;
        tcp_nopush on;
        aio threads;
        add_header Cache-Control "private, max-age=3600";
    }

    location /api/ {
        proxy_pass http://localhost:5009;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_request_buffering off;    # stream big uploads straight to Node
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }

    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location / {
        try_files $uri /index.html;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/matinee.prahladsingh.in /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

Make sure Nginx can read the built site (skip if your other React apps in `/var/www/projects` already load fine):

```bash
sudo chmod o+rx /var/www /var/www/projects
```

CHECK:

```bash
curl -I http://matinee.prahladsingh.in
curl http://matinee.prahladsingh.in/api/auth/me
```

First: `200 OK` (the React app). Second: the same JSON as in Part 4.

---

# PART 7 — SSL

```bash
sudo certbot --nginx -d matinee.prahladsingh.in
```

CHECK:

```bash
curl -I https://matinee.prahladsingh.in
```

`200 OK`, no cert warnings. **Now turn on secure cookies:**

```bash
nano /var/www/projects/matinee/server/.env     # set COOKIE_SECURE=true
pm2 restart matinee-api
```

---

# PART 8 — Adding videos

Two ways. Use both.

**A. Browser (small batches):** log in → Admin → Upload. Choose a folder, add files or a whole folder, edit the names, upload.

**B. Copy straight to the VPS (big batches, much faster):** from your PC:

```bash
rsync -avP ./Friends/ prahlad@50.6.44.245:/var/media/matinee/Friends/
# no rsync on Windows? use:  scp -r ./Friends prahlad@50.6.44.245:/var/media/matinee/
```

then Admin → **Scan library**. Folders become site folders, files become videos, and thumbnails are generated in the background. Scanning again also retries any thumbnails that failed earlier.

**Make files browser-friendly (once, for any MKV/AVI/odd files):**

```bash
cd /var/www/projects/matinee
./deploy/optimize.sh /var/media/matinee/Friends
```

It converts to MP4 (H.264 + AAC) and moves the index to the front of the file. Then click Scan library again. It first tries a lossless remux and only re-encodes if it must (that is slow on a VPS, so run it inside `tmux` or `screen`).

---

# PART 9 — CI/CD

`.github/workflows/deploy.yml` and the root `ecosystem.config.js` are already in the repo from Part 2.

Add these under the repo's Settings → Secrets and variables → Actions (same values as your other projects):

| Secret | Value |
|---|---|
| `VPS_HOST` | `50.6.44.245` |
| `VPS_USER` | `prahlad` |
| `VPS_SSH_KEY` | private key contents (`cat ~/.ssh/prahladsingh_deploy`) |
| `VPS_PORT` | `22` |

Confirm the shared sudoers rule still covers `nginx reload`:

```bash
sudo visudo -f /etc/sudoers.d/prahlad-deploy
```

Should contain:

```
prahlad ALL=(ALL) NOPASSWD: /usr/sbin/nginx -t, /usr/bin/systemctl reload nginx
```

Push to `main` and watch Actions. It SSHes in, pulls, installs, builds the client on the VPS, reloads PM2 and reloads Nginx. **Your videos and `.env` are never touched** (they are not in git).

---

# PART 10 — End-to-end test

1. Open `https://matinee.prahladsingh.in`. It should redirect to the login page. Log in with `ADMIN_USER` / `ADMIN_PASSWORD`.
2. Admin → create a folder, then upload one small MP4 into it.
3. Within about 10 seconds the thumbnail and duration should appear on the Home page. If not, ffmpeg is missing (Part 1.2); install it, then click Scan library.
4. Play it. In browser DevTools → Network, click the `stream/...` request. Status **206** with a `Content-Range` header means Nginx is serving ranges, so seeking is instant. If you see `200` and seeking is slow, check `USE_NGINX_ACCEL=true` and the `/_media/` block.
5. Prove Redis caching works:
   ```bash
   redis-cli -a YOUR_REDIS_PASSWORD --scan --pattern 'mt:*'
   ```
   Should list keys like `mt:home` and `mt:watch:...` after you browse a bit.
6. Add a second video (or scan one in), click "Surprise me", and confirm it picks randomly. Let a video end and confirm the "Up next" countdown works.
7. `pm2 restart matinee-api`, reload the site, and confirm you're still logged in (cookie) and playback works.
8. Push a trivial commit to `main` and confirm Actions deploys cleanly.

---

## If something breaks, check in this order

1. `pm2 logs matinee-api --lines 50` — did it connect to MongoDB? (#1 likely failure: Atlas IP allowlist or a typo in `MONGO_URI`.)
2. Still in those logs — `Redis unavailable`? Check `REDIS_URL` (password URL-encoded?). The site still works without Redis, just slower.
3. **Video won't start but the page loads** → Nginx can't read the file. Test as the Nginx user:
   ```bash
   sudo -u www-data head -c 100 "/var/media/matinee/<some file>" > /dev/null && echo readable
   ```
   If that fails: `sudo chmod o+rx /var/media /var/media/matinee` and `sudo chmod -R o+rX /var/media/matinee`.
4. **"This file won't play in your browser"** → the file's codec, not the server. Run `deploy/optimize.sh` on it (Part 8).
5. **Uploads fail at some size** → `client_max_body_size 0;` must be in the server block; then `sudo nginx -t && sudo systemctl reload nginx`.
6. **Login works but you bounce back to the login page** → `COOKIE_SECURE=true` while you're still on plain `http://`. Set it to `false` or finish Part 7.
7. **Thumbnails missing** → `ffmpeg -version`, then Admin → Scan library (it retries them).
8. **Site shows an old version after a deploy** → hard refresh. Check that `client/dist` was rebuilt (`ls -l client/dist/assets`).
9. `sudo nginx -t` — valid config?
10. **Stuttering on playback** → usually not code. Check the VPS's upload speed and how many people are watching. A 1080p stream needs about 5 Mbit/s each.
