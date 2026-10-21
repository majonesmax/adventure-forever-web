#!/bin/sh
# The Stella libretro core as WebAssembly, plus the Node test. Needs the Emscripten SDK (emcc on PATH:
# git clone https://github.com/emscripten-core/emsdk && ./emsdk install latest && ./emsdk activate latest
# && source ./emsdk_env.sh) and a build folder; the output goes to out/ (never commit it: it's an emulator core).
#
#   sh core/build.sh /path/to/build-folder
#   cp /path/to/adventure.a26 out/ && (cd out && python3 -m http.server 8765)
#   open "http://127.0.0.1:8765/index.html?rom=adventure.a26"       (or: node out/test.mjs /path/to/adventure.a26)
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
BUILD=${1:?a folder to build in}
mkdir -p "$BUILD" && BUILD=$(cd "$BUILD" && pwd)   # absolute: the script changes folder
COMMIT=b52ccb02e   # the same pinned Stella as tools/get_core.py
cd "$BUILD"
[ -d stella ] || git clone --filter=blob:none https://github.com/stella-emu/stella.git stella
git -C stella -c advice.detachedHead=false checkout -q $COMMIT
git -C stella apply --check "$HERE/no-timer-thread.patch" 2>/dev/null && git -C stella apply "$HERE/no-timer-thread.patch"
# The Makefile's emscripten target makes an archive (named .bc, but it's `ar` output). Stella throws and
# catches C++ exceptions, which Emscripten turns off unless asked: -fwasm-exceptions, in both steps.
make -C stella/src/os/libretro platform=emscripten CC="emcc -fwasm-exceptions" CXX="em++ -fwasm-exceptions" AR=emar -j8
OUT=$(cd "$HERE/.." && pwd)/out
mkdir -p "$OUT" && cd "$OUT"
cp "$BUILD/stella/src/os/libretro/stella_libretro_emscripten.bc" stella_libretro.a
em++ -O2 -fwasm-exceptions -std=c++20 -I"$BUILD/stella/src/os/libretro" -c "$HERE/shim.cpp" -o shim.o
em++ -O2 -fwasm-exceptions shim.o stella_libretro.a -o stella.js \
  -sMODULARIZE -sEXPORT_ES6 -sEXPORT_NAME=createStella -sENVIRONMENT=web,node \
  -sALLOW_MEMORY_GROWTH -sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPU16,HEAP16 -sEXPORTED_FUNCTIONS=_malloc,_free
cp "$HERE/test.mjs" .   # the page itself: web/bundle.sh
ls -la stella.js stella.wasm
