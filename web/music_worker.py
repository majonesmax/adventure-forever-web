"""The songs, made in the music worker: Adventure Forever's own built-in songs (engine/chiptune.py), played by
the look's band (the NES chip, the SNES orchestra, the VGA sound card, paper's toy box), exactly as the
desktop makes them - in a Web Worker, so the game never waits. render(look, area) -> (left, right, loop)."""

import sys
import types

sys.modules["sounddevice"] = types.ModuleType("sounddevice")  # the desktop sound card: not in a browser

import numpy as np  # noqa: E402

from engine import chiptune, music  # noqa: E402

BANDS = music.bands()


def render(look: str, area: str):  # noqa: ANN201 - a tuple for JavaScript: two float32 arrays and a flag
    """The area's song on the look's band, as float samples for Web Audio (-1 to 1), and whether it loops."""
    spec = music.BUILT_IN[area]
    song = chiptune.SONGS[spec["song"]]
    band = BANDS.get(look, BANDS["nes"])
    pcm = band(song)                                   # int16 stereo, (frames, 2), at music.RATE
    channels = np.ascontiguousarray(pcm.T).astype(np.float32) / 32768.0
    return channels[0], channels[1], bool(song["loop"])
