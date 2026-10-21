# Adventure Forever, in the browser

Atari 2600 *Adventure*, running unmodified in the [Stella](https://github.com/stella-emu/stella) emulator
compiled to WebAssembly, redrawn from the game's 128 bytes of RAM the way
[Adventure Forever](https://github.com/majonesmax/adventure-forever) does on the desktop. This repository is
the web page, the core build and the deployment; the game knowledge, looks and packs live in
Adventure Forever and are pulled from a release tag.

**Status: a working spike.** The core runs the game in a page with the live RAM beside it. The looks
(NES, SNES, VGA, paper) are not drawn in the browser yet - that's the next decision, see [Plan](#plan).

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
(cd out && python3 -m http.server 8765)       # then open http://127.0.0.1:8765/index.html and choose your ROM
```

Arrows move, Space is the button, Enter is Reset (start), Shift is Select. Click the page once for sound.
For testing, `?rom=adventure.a26` fetches a ROM copy placed in `out/` (never commit it), and `&demo` presses
Reset and walks right by itself.

## What's here

| | |
|---|---|
| `core/build.sh` | builds the Stella libretro core with Emscripten, at the same pinned commit as Adventure Forever's `tools/get_core.py` |
| `core/shim.cpp` | the libretro frontend: the same answers Adventure Forever's `engine/emulator.py` gives the core, as `af_*` functions JavaScript can call (load a ROM, run a frame, the joystick, pointers to the RAM, picture and sound) |
| `core/no-timer-thread.patch` | plain WebAssembly has no threads; Stella's timer thread only clears held switches at start and paces log messages, so the browser build skips it |
| `core/test.mjs` | the Node check: loads a ROM, presses Reset, walks right, prints the 128 bytes and the time per frame |
| `web/index.html` | the page: canvas, live RAM, keyboard joystick, the game's sound through Web Audio |
| `.github/workflows/pages.yml` | builds the core and publishes the page to GitHub Pages |
| `out/` | the build (not committed: the core is an emulator binary, like Adventure Forever's `cores/`) |

Two things the build needed: `-fwasm-exceptions` (Stella throws and catches C++ exceptions; Emscripten turns
them off by default), and the timer patch above. Measured on Apple Silicon: the core runs a frame in about
0.5 ms of the 16.7 ms budget; `stella.wasm` is 2.1 MB.

## Plan

The hard part (the emulator, with the RAM readable every frame) is done. What's left is drawing the looks:

1. **Keep the Python** and run it in the browser with [pygbag](https://pygame-web.github.io/): Adventure
   Forever as a git submodule pinned to a release tag, its frame loop made async, and the native bits
   (the core, the sound card, libgme) behind interfaces with browser implementations. One codebase, the
   golden tests still apply. The unknown is frame time: test the NES look alone first.
2. **Port the runtime to TypeScript**: the RAM map, room and object decoding, layout, pixel pasting and the
   looks. Fast and small; the golden PNGs are the acceptance test. A second codebase to keep in step.

Either way the wasm core should come from the same place as the other cores: one more entry in Adventure
Forever's `stella-cores.yml` matrix, so every platform's core is in one checksummed release.

## Licences

This repository: MIT (`LICENSE`). Stella is GPL-2.0-or-later; the published `stella.wasm` is built from the
pinned commit named in `core/build.sh`, whose source is at
https://github.com/stella-emu/stella and in Adventure Forever's `stella-<commit>` release. *Adventure* is
Atari's and is not included.
