# Adventure Forever, in the browser

Atari 2600 *Adventure*, running unmodified in the [Stella](https://github.com/stella-emu/stella) emulator
compiled to WebAssembly, redrawn from the game's 128 bytes of RAM the way
[Adventure Forever](https://github.com/majonesmax/adventure-forever) does on the desktop. This repository is
the web page, the core build and the deployment; the game knowledge, looks and packs live in
Adventure Forever and are pulled from a release tag.

**Status: playable.** One page: choose your ROM once (it's remembered in your browser), press Play, and the
game runs in Adventure Forever's looks (NES, SNES, VGA, paper) with the desktop's keys, its background
music on each look's own band, and fullscreen. The drawing and the music are the desktop app's own Python,
run in the browser by [Pyodide](https://pyodide.org): the same `engine/`, `looks/`, `content/` and packs,
from a pinned release, unchanged. What's still missing: see [Plan](#plan).

## You need your own ROM

The game is Atari's. Nothing here includes it, and the site never does: the page asks for your `adventure.a26`
once and keeps it in your browser's storage. Which files work, and what happens with a hack or the PAL
version: [Which ROM](https://github.com/majonesmax/adventure-forever/blob/main/GO-OUTSIDE-NERD.md#which-rom).

## Run it

```sh
git clone https://github.com/emscripten-core/emsdk && (cd emsdk && ./emsdk install latest && ./emsdk activate latest)
source emsdk/emsdk_env.sh
sh core/build.sh build                        # clones Stella at the pinned commit, builds out/stella.wasm (a few minutes)
node out/test.mjs /path/to/adventure.a26      # the core alone: loads the ROM, walks right, times 600 frames
sh web/bundle.sh                              # the drawing side of Adventure Forever, zipped for the page
(cd out && python3 -m http.server 8765)       # then open http://127.0.0.1:8765/ and choose your ROM
```

Then `sh web/bundle.sh` zips the drawing side of Adventure Forever (the `adventure-forever` submodule, pinned
to a release) into `out/` with the page.

## Keys

The desktop's keys, less what the browser doesn't do yet (room scrolls, recording, the grid's comparison pane,
other music sources). H shows this list in the game.

| | |
|---|---|
| Arrows, Space | move; fire (drop what you carry) |
| Tab, Enter | game select (games 1-3); game reset (start) |
| L, C, W | next look (NES, SNES, VGA, paper); next cast; next world |
| I | which look, cast and world |
| V | view: look, side by side with the 2600, the 2600 alone, grid (with the live RAM) |
| F | fullscreen on / off (also the button in the corner) |
| M, - / = | music on / off; quieter / louder |
| S, D, P | screenshot; debug line (speed, render time); pause |
| H, Esc | help; back to the start |

Adventure itself only makes a sound when something happens. For testing, `?rom=adventure.a26` fetches a ROM
copy placed in `out/` (never commit it) and starts the game, and `&demo` presses Reset and walks right by itself.

## What's here

| | |
|---|---|
| `core/build.sh` | builds the Stella libretro core with Emscripten, at the same pinned commit as Adventure Forever's `tools/get_core.py` |
| `core/shim.cpp` | the libretro frontend: the same answers Adventure Forever's `engine/emulator.py` gives the core, as `af_*` functions JavaScript can call (load a ROM, run a frame, the joystick, pointers to the RAM, picture and sound) |
| `core/no-timer-thread.patch` | plain WebAssembly has no threads; Stella's timer thread only clears held switches at start and paces log messages, so the browser build skips it |
| `core/test.mjs` | the Node check: loads a ROM, presses Reset, walks right, prints the 128 bytes and the time per frame |
| `web/atari.js` | the Atari in the browser: the core, the keyboard as joystick, sound through Web Audio, the 2600's picture, the RAM as text |
| `web/index.html`, `web/app.js` | the page: the start screen (your ROM, remembered in the browser), then the game with the keys, views, help, pause, screenshot and fullscreen |
| `web/web_game.py` | the glue Python: start(rom) reads the ROM's tables, draw(ram, frame) returns the look's picture, L C W cycle the look, cast and world |
| `web/music.js` | the music: one song per area (title, overworld, dungeon, final, win) on the look's band, played through Web Audio; switching looks keeps the place in the song |
| `web/music-worker.js`, `web/music_worker.py` | a second Pyodide in a Web Worker making each song with Adventure Forever's own song code (`engine/chiptune.py` and the bands), so the game never waits |
| `web/bundle.sh` | zips the submodule's engine, looks, content, shared helpers and packs for the page |
| `adventure-forever/` | the desktop project as a git submodule, pinned to a release tag |
| `tools/drive.mjs` | the page played by headless Chrome: presses Reset, walks right, and prints whether the hero moved and the frame rate held |
| `.github/workflows/pages.yml` | builds the core and publishes the page to GitHub Pages |
| `out/` | the build (not committed: the core is an emulator binary, like Adventure Forever's `cores/`) |

Two things the build needed: `-fwasm-exceptions` (Stella throws and catches C++ exceptions; Emscripten turns
them off by default), and the timer patch above. Measured on Apple Silicon in Chrome, per frame of the 16.7 ms budget:

| | native Python | in the browser |
|---|---|---|
| the core (one 2600 frame) | - | 0.8 to 1.5 ms |
| NES look | 0.4 ms | 2.3 ms |
| SNES look | 0.7 ms | 3.3 ms |
| VGA look | 1.2 ms | 3.5 ms |
| paper look | 0.8 ms | 4.0 ms |

Downloads: `stella.wasm` 2.1 MB; Pyodide with numpy and Pillow about 15 MB from the CDN (cached by the
browser); the drawing side 0.6 MB. The looks page takes a few seconds to start.

One portability bug turned up: the PBJ pack's world hashes pixel coordinates with a constant too big for a
32-bit integer, which numpy defaults to under WebAssembly (the desktop's is 64-bit). The fix in Adventure
Forever casts to 64-bit explicitly; until a release with it is pinned here, L passes over the SNES look
(whose own world it is) and W onto that world shows nothing until W again.

## Plan

The decision the experiment was for is made: the desktop's Python draws the looks in the browser fast
enough, so there is one codebase, and the golden tests keep proving it. What's left is the app around the
game, which on the desktop is `app/window.py` (pygame) and here is JavaScript:

1. Room scrolls (`app/transitions.py` is pure numpy, so it can run in Python here too).
2. The worlds' sounds with the music off (`engine/ambience.py`, numpy too), and a world's own soundtrack.
3. Touch controls for phones and tablets; a gamepad.
4. The wasm core from the same place as the other cores: one more entry in Adventure Forever's
   `stella-cores.yml` matrix, so every platform's core is in one checksummed release.

## Licences

This repository: MIT (`LICENSE`). Stella is GPL-2.0-or-later; the published `stella.wasm` is built from the
pinned commit named in `core/build.sh`, whose source is at
https://github.com/stella-emu/stella and in Adventure Forever's `stella-<commit>` release. *Adventure* is
Atari's and is not included.
