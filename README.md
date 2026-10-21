# Adventure Forever, in the browser

Atari 2600 *Adventure*, running unmodified in the [Stella](https://github.com/stella-emu/stella) emulator
compiled to WebAssembly, redrawn from the game's 128 bytes of RAM the way
[Adventure Forever](https://github.com/majonesmax/adventure-forever) does on the desktop. This repository is
the web page, the core build and the deployment; the game knowledge, looks and packs live in
Adventure Forever and are pulled from a release tag.

**Status: it works, as an experiment.** `index.html` is the 2600 alone, with the live RAM beside it.
`looks.html` draws the game in Adventure Forever's looks (NES, SNES, VGA, paper) using the desktop app's own
Python, run in the browser by [Pyodide](https://pyodide.org): the same `engine/`, `looks/`, `content/` and
packs, from a pinned release, unchanged. All four hold 60 frames a second. What's missing is the app
around the game (room scrolls, music, the pack cycling, the overlays): see [Plan](#plan).

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
sh web/bundle.sh                              # the drawing side of Adventure Forever, zipped for looks.html
(cd out && python3 -m http.server 8765)       # then open http://127.0.0.1:8765/looks.html and choose your ROM
```

Then `sh web/bundle.sh` zips the drawing side of Adventure Forever (the `adventure-forever` submodule, pinned
to a release) into `out/` for `looks.html`.

Arrows move, Space is the button, Enter is Reset (start), Shift is Select, and on the looks page L is the next
look. Adventure only makes a sound when something happens. For testing, `?rom=adventure.a26` fetches a ROM
copy placed in `out/` (never commit it), and `&demo` presses Reset and walks right by itself.

## What's here

| | |
|---|---|
| `core/build.sh` | builds the Stella libretro core with Emscripten, at the same pinned commit as Adventure Forever's `tools/get_core.py` |
| `core/shim.cpp` | the libretro frontend: the same answers Adventure Forever's `engine/emulator.py` gives the core, as `af_*` functions JavaScript can call (load a ROM, run a frame, the joystick, pointers to the RAM, picture and sound) |
| `core/no-timer-thread.patch` | plain WebAssembly has no threads; Stella's timer thread only clears held switches at start and paces log messages, so the browser build skips it |
| `core/test.mjs` | the Node check: loads a ROM, presses Reset, walks right, prints the 128 bytes and the time per frame |
| `web/atari.js` | the Atari in the browser: the core, the keyboard as joystick, sound through Web Audio, the 2600's picture, the RAM as text |
| `web/index.html` | the 2600 alone, with the live RAM |
| `web/looks.html` | the looks: Pyodide runs Adventure Forever's own Python, which draws each frame from the 128 bytes |
| `web/web_game.py` | the glue Python: start(rom) reads the ROM's tables, draw(ram, frame) returns the look's picture |
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

One portability bug turned up: the SNES look's pack hashed pixel coordinates with a constant too big for a
32-bit integer, which numpy defaults to under WebAssembly (the desktop's is 64-bit). The fix in Adventure
Forever casts to 64-bit explicitly; until a release with it is pinned here, L skips the SNES look with a note.

## Plan

The decision the experiment was for is made: the desktop's Python draws the looks in the browser fast
enough, so there is one codebase, and the golden tests keep proving it. What's left is the app around the
game, which on the desktop is `app/window.py` (pygame) and here is JavaScript:

1. Room scrolls (`app/transitions.py` is pure numpy, so it can run in Python here too), the "now showing"
   overlay, C and W for casts and worlds, the help panel.
2. Music and the worlds' sounds: the desktop synthesises them in numpy (`engine/band.py`,
   `engine/ambience.py`), which Pyodide can run; the browser plays the samples through Web Audio.
3. Remember the ROM in the browser's storage, so it's picked once. Load faster: Pyodide and the packages
   are cached by the browser after the first visit.
4. The wasm core from the same place as the other cores: one more entry in Adventure Forever's
   `stella-cores.yml` matrix, so every platform's core is in one checksummed release.

## Licences

This repository: MIT (`LICENSE`). Stella is GPL-2.0-or-later; the published `stella.wasm` is built from the
pinned commit named in `core/build.sh`, whose source is at
https://github.com/stella-emu/stella and in Adventure Forever's `stella-<commit>` release. *Adventure* is
Atari's and is not included.
