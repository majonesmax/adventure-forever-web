#!/bin/sh
# The drawing side of Adventure Forever (its engine, looks, content, shared helpers and public packs) as one
# zip for the page to unpack into Pyodide's file system. From the submodule, so it's a pinned release.
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
OUT=$(cd "$HERE/.." && pwd)/out
mkdir -p "$OUT"
rm -f "$OUT/adventure-forever.zip"
cd "$HERE/../adventure-forever"
git describe --tags --always > VERSION.txt   # the tag, or the commit where there are no tags (a shallow checkout)
zip -q -r "$OUT/adventure-forever.zip" engine looks content shared packs VERSION.txt LICENSE LICENSE-ASSETS.md \
  -x '*__pycache__*' -x '*.pyc' -x 'engine/effects/*.wav'
rm VERSION.txt
cp "$HERE/looks.html" "$HERE/atari.js" "$HERE/web_game.py" "$HERE/music.js" "$HERE/music-worker.js" "$HERE/music_worker.py" "$OUT/"
ls -la "$OUT/adventure-forever.zip"
