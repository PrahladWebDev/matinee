# Upload videos to Matinee with WinSCP
### Pick a folder on your PC → drop it into a folder on the server → click Scan

Use this for anything bigger than a few files. It's faster than uploading in the browser, it can resume after a power cut, and it can run in the background.

**How it fits together:** the server keeps your videos in `/var/media/matinee/`. Every folder inside it becomes a folder on the website. Copy files in, click **Scan library**, and they appear.

```
/var/media/matinee/
├── Meal Time/                 → folder "Meal Time" on the site
│   └── Zamaana/               → sub-folder "Zamaana"
│       ├── Bijli Gul.mp4      → video "Bijli Gul"
│       └── ...
└── Friends/
    ├── Season 1/
    └── Season 2/
```

---

## One-time: save your server login in WinSCP

1. Open WinSCP. On the login screen fill in:
   - **File protocol:** SFTP
   - **Host name:** `50.6.44.245`
   - **Port number:** `22`
   - **User name:** `prahlad`
   - **Password:** your server password
2. Click **Save**, give it a name like `Matinee VPS`, and click OK.
3. From now on, just double-click `Matinee VPS` to connect.

You'll see two panels: **left = your PC, right = the server.**

---

## Every time you add videos

### Step 1 — Choose the folder on your PC (left panel)
- Use the drive dropdown at the top-left of the left panel to pick a drive (for example `F:`).
- Double-click through to the folder that has your videos.
- Or press `Ctrl+O` in the left panel and type the path, for example `F:\prahlad`.

### Step 2 — Choose the destination on the server (right panel)
- Click once in the right panel, press `Ctrl+O`, type the path, and press Enter. For example:
  ```
  /var/media/matinee/Meal Time/Zamaana
  ```
- **The folder doesn't exist yet?** Go one level up, press **F7** (New Directory), type the name, and press Enter. Then open it. You can create the folder here or in **Admin → Folders**. Both work.

**Rules for folder names:**
- Use plain names, like `Friends`, `Season 1`, `Zamaana`.
- Avoid `/ \ : * ? " < > |` in names.
- Names are case-sensitive on the server, so `Friends` and `friends` are two different folders.

### Step 3 — Copy
- **A few files:** click them in the left panel (hold `Ctrl` to pick several, or `Ctrl+A` for all) and press **F5**.
- **A whole folder with sub-folders** (for example a series with `Season 1`, `Season 2`): drag the folder from the left panel into the right panel. The sub-folders are copied too, and become sub-folders on the site.
- In the dialog, tick **Transfer in background (add to transfer queue)** so you can keep using WinSCP, then click **OK**.

### Step 4 — Wait until the queue is empty
Watch the **Queue** panel at the bottom of WinSCP. It shows percentage, speed and time left.
- Keep the PC on and connected. Turn off sleep in Windows while it runs.
- **Do not click Scan until the queue is empty.** Otherwise half-copied files get registered.
- Interrupted (shutdown, internet drop)? Reconnect, select all again, press F5, and choose **Skip** (or **Resume**) for files already there. Nothing needs to be deleted.

### Step 5 — Check that everything arrived (optional but quick)
Over SSH on the server:
```bash
ls "/var/media/matinee/Meal Time/Zamaana" | wc -l       # number of files
du -sh "/var/media/matinee/Meal Time/Zamaana"           # total size
```
Compare with the count and size on your PC.

### Step 6 — Make videos start instantly (recommended)
Over SSH on the server, inside `tmux` if the folder is big:
```bash
cd /var/www/projects/matinee
nice -n 19 ionice -c3 bash deploy/optimize.sh "/var/media/matinee/Meal Time/Zamaana"
```
It converts odd formats (MKV, AVI) to MP4 and moves the index to the front of each file, so playback starts and seeks immediately. It ends with `Done`. Skip this step for MP4 files that already play fine.

### Step 7 — Scan
1. Open the website and log in.
2. Go to **Admin → Scan library** and click **Scan now**.
3. A message appears, like `Added 199 videos and 0 folders`.
4. Thumbnails appear over the next few minutes (the server makes them one at a time). Refresh to see them.

---

## Tips

**Playing order.** Episodes are sorted by title with numbers read as numbers, so `Ep 2` comes before `Ep 10`. To control the order, name files `01 - Pilot.mp4`, `02 - Second.mp4`, and so on. You can also rename a title later in **Admin → Manage videos** (the file itself is unchanged).

**Titles.** A video's title is its file name without `.mp4`. Rename files before copying if you want nicer titles. On the home page and folder pages, resolution tags like `(720P_HD)` are hidden automatically.

**Supported files:** `.mp4`, `.m4v`, `.webm`, `.mkv`, `.mov`. MP4 (H.264 + AAC) is the safest for browsers.

**Moving a video to another folder.** Use **Admin → Manage videos → Move to…**. This moves the real file on the server. Don't move files around in WinSCP and then forget to scan.

**Deleting.**
- In **Admin**, **Delete** removes the video and its file.
- If you delete files in WinSCP instead, click **Scan now** afterwards and the site removes those entries.

**Disk space.** Check how much room is left before a big copy:
```bash
df -h /var
```
Keep 10 GB or more free.

**Your originals.** The files on your PC are untouched. Keep them until you've confirmed playback works.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| Videos don't show on the site | Click **Scan now**. Also check that they're inside `/var/media/matinee/...`, not your home folder `/home/prahlad/`. |
| Scan says `Added 0 videos` | The queue is probably not finished, the files are in the wrong folder, or the extension isn't supported. |
| Video is listed but says "This file won't play in your browser" | Run the optimizer (Step 6) on that folder, then **Scan now**. |
| Plays but is slow to start or seek | Run the optimizer (Step 6). |
| No thumbnails | Wait a few minutes after the scan. If still missing, run `ffmpeg -version` on the server. Then click **Scan now** again, which retries missing thumbnails. |
| Wrong folder name on the site | In **Admin → Folders → Rename**. This renames the display name only. |
| WinSCP says "Permission denied" | You're probably in the wrong server folder. Go to `/var/media/matinee/` and try again. |
| File transfer failed on one file | WinSCP shows the file name. Right-click it in the queue and **Retry**, or repeat the copy and choose **Skip** for the rest. |

---

## 30-second version

1. Open WinSCP and connect to `Matinee VPS`.
2. Left: your videos folder. Right: `/var/media/matinee/<Folder>/`.
3. Drag the files or folder across, in background mode.
4. Wait until the queue is empty.
5. Website → **Admin → Scan library → Scan now**.
