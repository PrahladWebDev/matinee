#!/usr/bin/env bash
# Make every video in a folder browser-friendly and instant-start:
#   * converts mkv/mov/avi/webm -> mp4 (no quality loss when the codecs allow it)
#   * moves the index to the front of the file ("faststart") so playback begins and seeks immediately
# Usage:  ./deploy/optimize.sh /var/media/matinee/Friends      (then click "Scan library" in Admin)
set -u
dir="${1:-.}"
command -v ffmpeg >/dev/null || { echo "ffmpeg not installed (sudo apt install ffmpeg)"; exit 1; }

find "$dir" -type f \( -iname '*.mkv' -o -iname '*.mp4' -o -iname '*.mov' -o -iname '*.avi' -o -iname '*.webm' -o -iname '*.m4v' \) ! -name '*.tmp.mp4' -print0 |
while IFS= read -r -d '' f; do
  final="${f%.*}.mp4"
  tmp="${f%.*}.tmp.mp4"
  echo "-> $f"
  # 1) try a lossless remux (fast)
  if ffmpeg -nostdin -v error -y -i "$f" -map 0:v:0 -map 0:a:0? -c copy -movflags +faststart "$tmp" 2>/dev/null; then
    :
  # 2) otherwise re-encode to H.264 + AAC (slower, plays everywhere)
  elif ffmpeg -nostdin -v error -y -i "$f" -map 0:v:0 -map 0:a:0? -c:v libx264 -preset fast -crf 21 -c:a aac -b:a 160k -movflags +faststart "$tmp"; then
    :
  else
    echo "   failed, skipped"; rm -f "$tmp"; continue
  fi
  [ "$f" != "$final" ] && rm -f "$f"
  mv -f "$tmp" "$final"
done
echo "Done. Now open Admin -> Scan library."
