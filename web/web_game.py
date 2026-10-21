"""Adventure Forever's looks in the browser: the same engine/, looks/ and content/ as the desktop app, run by
Pyodide (CPython as WebAssembly). JavaScript calls start(rom) once; next_look / next_cast / next_world as
the player presses L, C and W; draw(ram, frame_no) every frame, which hands back the 256x240 RGBA picture
for the canvas; music_area() for which music that moment wants (the songs are made in the music worker);
and showing() for the "look · cast · world" line.

The desktop's native parts are not here: the emulator is the wasm core on the JavaScript side (this file only
ever sees its 128 bytes), and nothing on the drawing side needs a sound card.
"""

import numpy as np

import content
import looks
from engine import music
from engine import rooms as R
from engine.state import Game
from looks.base import RoomLook
from shared import layout as L

ROM_PATH = "/adventure.a26"   # the player's ROM, in the browser's memory only

game: Game | None = None
look_key = "nes"
cast_key: str | None = None    # None: the look's own pack's
world_key: str | None = None
made: dict[tuple[str, str | None, str | None], RoomLook] = {}   # each look with a cast and world, made once
rgba = np.full((L.SCREEN_H, L.SCREEN_W, 4), 255, np.uint8)   # the picture handed to the canvas (alpha 255)
area = "title"                                                # the music area of the last frame drawn


def start(rom) -> str:  # noqa: ANN001 - a JavaScript Uint8Array
    """Read the ROM's tables (rooms, objects) and make the first look. Returns the showing line."""
    global game
    with open(ROM_PATH, "wb") as f:
        f.write(rom.to_bytes())
    R.ROM_PATH = ROM_PATH   # the looks read walls and graphics from the ROM too
    game = Game()
    return showing()


def look() -> RoomLook:
    """The look on screen, with the chosen cast and world - made once, then kept."""
    assert game is not None
    key = (look_key, cast_key, world_key)
    if key not in made:
        made[key] = looks.make(*key, game.reader)
    return made[key]


def following(keys: list[str], current: str) -> str:
    return keys[(keys.index(current) + 1) % len(keys)] if current in keys else keys[0]


def next_look() -> str:
    """L: the next look (console), same cast and world - the next one that loads, if one won't."""
    return _cycle(list(looks.LOOKS), lambda: look_key, _set_look)


def next_cast() -> str:
    """C: the next cast, on every look (the public packs: classic, pbj...)."""
    return _cycle(content.casts(public=True), lambda: cast_key or look().cast.key, _set_cast)


def next_world() -> str:
    """W: the next world, on every look."""
    return _cycle(content.worlds(public=True), lambda: world_key or look().world.key, _set_world)


def _cycle(keys: list[str], current, choose) -> str:  # noqa: ANN001
    """Choose the next key after the current one that loads; one that fails is passed over (and printed),
    and if none loads the choice stays as it was and the last error is raised."""
    before = current()
    key, error = before, None
    for _ in keys:
        key = following(keys, key)
        choose(key)
        try:
            return showing()
        except Exception as err:   # a pack that won't load in the browser: skip it
            error = err
            print(f"{key} didn't load: {err!r}")
    choose(before)
    raise RuntimeError(f"none of {keys} loads") from error


def _set_look(key: str) -> None:
    global look_key
    look_key = key


def _set_cast(key: str | None) -> None:
    global cast_key
    cast_key = key


def _set_world(key: str | None) -> None:
    global world_key
    world_key = key


def showing() -> str:
    """What's on screen: the look, the cast and the world, as I shows them."""
    current = look()
    return f"{current.platform_name} · {current.cast.name} · {current.world.name}"


def draw(ram, frame_no: int):  # noqa: ANN001, ANN201 - a JavaScript Uint8Array in, a numpy array out
    """The look's picture for this frame, from the 128 bytes."""
    global area
    assert game is not None
    ram_bytes = np.frombuffer(ram.to_bytes(), np.uint8)
    state = game.state(ram_bytes)
    area = music.area_for(state)
    picture = look().draw(state, frame_no)
    rgba[:, :, :3] = picture
    return rgba


def music_area() -> str:
    """Which music belongs to the last frame drawn: title / overworld / dungeon / final / win."""
    return area
