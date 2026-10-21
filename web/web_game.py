"""Adventure Forever's looks in the browser: the same engine/, looks/ and content/ as the desktop app, run by
Pyodide (CPython as WebAssembly). JavaScript calls start(rom) once, choose_look(key) to change the look, and
draw(ram, frame_no) every frame; draw hands back the 256x240 RGBA picture for the canvas, and music_area()
says which music that moment wants (the songs themselves are made in the music worker).

The desktop's native parts are not here: the emulator is the wasm core on the JavaScript side (this file only
ever sees its 128 bytes), and the sound card module is stood in for, since engine.palette imports the desktop
emulator binding, which imports it.
"""

import sys
import types

sys.modules["sounddevice"] = types.ModuleType("sounddevice")  # the desktop sound card: not in a browser

import numpy as np  # noqa: E402

import looks  # noqa: E402
from engine import music  # noqa: E402
from engine import rooms as R  # noqa: E402
from engine.state import Game  # noqa: E402
from looks.base import RoomLook  # noqa: E402
from shared import layout as L  # noqa: E402

ROM_PATH = "/adventure.a26"   # the player's ROM, in the browser's memory only

game: Game | None = None
look: RoomLook | None = None
look_key = "nes"
rgba = np.full((L.SCREEN_H, L.SCREEN_W, 4), 255, np.uint8)   # the picture handed to the canvas (alpha 255)
area = "title"                                                # the music area of the last frame drawn


def start(rom) -> str:  # noqa: ANN001 - a JavaScript Uint8Array
    """Read the ROM's tables (rooms, objects) and make the first look. Returns the look's name."""
    global game
    with open(ROM_PATH, "wb") as f:
        f.write(rom.to_bytes())
    R.ROM_PATH = ROM_PATH   # the looks read walls and graphics from the ROM too
    game = Game()
    return choose_look(look_key)


def choose_look(key: str) -> str:
    """Switch to the look called `key` (nes, snes, vga, paper), with its own pack. Returns its name."""
    global look, look_key
    assert game is not None
    look_key = key
    look = looks.make(key, None, None, game.reader)
    return f"{look.platform_name} ({key})"


def next_look() -> str:
    keys = list(looks.LOOKS)
    return choose_look(keys[(keys.index(look_key) + 1) % len(keys)])


def draw(ram, frame_no: int):  # noqa: ANN001, ANN201 - a JavaScript Uint8Array in, a numpy array out
    """The look's picture for this frame, from the 128 bytes."""
    assert game is not None and look is not None
    global area
    ram_bytes = np.frombuffer(ram.to_bytes(), np.uint8)
    state = game.state(ram_bytes)
    area = music.area_for(state)
    picture = look.draw(state, frame_no)
    rgba[:, :, :3] = picture
    return rgba


def music_area() -> str:
    """Which music belongs to the last frame drawn: title / overworld / dungeon / final / win."""
    return area
