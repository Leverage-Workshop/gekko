#!/usr/bin/env python3
"""Pull auto-caption transcripts for the prep videos into `transcripts/`.

Usage:
    python3 pull-transcripts.py videos.json [--browser chrome] [--limit 20]

`videos.json` is the list exported from YouTube — objects with `url` and `date`:

    [{"title": "3.18.2026_premarket prep",
      "url":   "https://www.youtube.com/watch?v=1sx-X1B6MGc",
      "date":  "2026-03-18T12:49:18.193Z"}]

Output is one plain-text file per video, `YYYY-MM-DD_<id>.txt`, matching the naming
the notes and process docs reference. Already-downloaded videos are skipped, so the
script is safe to re-run after an interruption.

Why cookies: YouTube rate-limits anonymous caption requests hard (HTTP 429 + "Sign in
to confirm you're not a bot") once a single IP has pulled a few dozen. A logged-in
browser profile avoids it. Requires yt-dlp (`pip install -U yt-dlp`).
"""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

OUT_DIR = Path(__file__).parent / "transcripts"
DELAY_SECONDS = 3


def video_id(url: str) -> str | None:
    m = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)
    return m.group(1) if m else None


def to_text(json3_path: Path) -> str:
    """Flatten a json3 caption file into a single line of prose."""
    data = json.loads(json3_path.read_text())
    words = [
        seg["utf8"].strip()
        for event in data.get("events", [])
        for seg in (event.get("segs") or [])
        if seg.get("utf8", "").strip()
    ]
    return re.sub(r"\s+", " ", " ".join(words))


def fetch(vid: str, browser: str | None, tmp_dir: Path) -> Path | None:
    cmd = [
        "yt-dlp", "--skip-download",
        "--write-auto-subs", "--sub-langs", "en", "--sub-format", "json3",
        "-o", str(tmp_dir / "%(id)s.%(ext)s"),
        f"https://www.youtube.com/watch?v={vid}",
    ]
    if browser:
        cmd[1:1] = ["--cookies-from-browser", browser]
    subprocess.run(cmd, capture_output=True, text=True)
    produced = tmp_dir / f"{vid}.en.json3"
    return produced if produced.exists() else None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("videos", help="JSON file of {url, date} objects")
    ap.add_argument("--browser", default="chrome",
                    help="browser profile for cookies (chrome/firefox/safari/edge); "
                         "pass 'none' to try anonymously")
    ap.add_argument("--limit", type=int, help="stop after N new transcripts")
    args = ap.parse_args()

    browser = None if args.browser == "none" else args.browser
    entries = json.loads(Path(args.videos).read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    tmp_dir = OUT_DIR / ".raw"
    tmp_dir.mkdir(exist_ok=True)

    pulled = failed = skipped = 0
    for entry in entries:
        vid = video_id(entry.get("url", ""))
        if not vid:
            print(f"skip  (no id) {entry.get('title', '?')}", file=sys.stderr)
            continue

        day = entry["date"][:10]
        dest = OUT_DIR / f"{day}_{vid}.txt"
        if dest.exists():
            skipped += 1
            continue
        if args.limit and pulled >= args.limit:
            break

        raw = fetch(vid, browser, tmp_dir)
        if raw is None:
            print(f"FAIL  {day} {vid}", file=sys.stderr)
            failed += 1
        else:
            dest.write_text(to_text(raw) + "\n")
            print(f"ok    {day} {vid}")
            pulled += 1
        time.sleep(DELAY_SECONDS)

    print(f"\n{pulled} pulled, {skipped} already present, {failed} failed")
    if failed:
        print("Re-run to retry the failures — existing files are skipped.")
        print("If everything fails with 429 or a bot check, the IP is blocked; "
              "wait, or pass --browser with a logged-in profile.")
    return 1 if failed and not pulled else 0


if __name__ == "__main__":
    raise SystemExit(main())
