"""The songs and the world's sounds, made in the music worker with Adventure Forever's own code, exactly as the
desktop makes them - in a Web Worker, so the game never waits.

render(look, area) -> (left, right, loop): the area's built-in song (engine/chiptune.py) on the look's band.
render_sound(name) -> the world sound (engine/ambience.py: summer, woods, hall, cave...): its bed, which
loops, and its calls, dropped in at random moments by the page; all as float samples for Web Audio.
"""

import numpy as np

from engine import ambience, chiptune, music

BANDS = music.bands()
FULL_SCALE = 32768.0   # int16 -> -1..1


def bands() -> list[str]:
    """The looks that have a band; the others (paper) play no song, and the world is heard."""
    return list(BANDS)


def render(look: str, area: str):  # noqa: ANN201 - a tuple for JavaScript: two float32 arrays and a flag
    """The area's song on the look's band, as float samples for Web Audio (-1 to 1), and whether it loops."""
    spec = music.BUILT_IN[area]
    song = chiptune.SONGS[spec["song"]]
    pcm = BANDS[look](song)                            # int16 stereo, (frames, 2), at music.RATE
    channels = np.ascontiguousarray(pcm.T).astype(np.float32) / FULL_SCALE
    return channels[0], channels[1], bool(song["loop"])


def render_sound(name: str):  # noqa: ANN201 - a dict for JavaScript
    """A world sound as the desktop plays it: the bed (stereo, loops) and the calls (mono, each placed left
    or right as it plays), with each call's name, how likely it is, and the seconds between calls."""
    sound = ambience.Sound(name)
    bed = np.ascontiguousarray(sound.bed.T).astype(np.float32) / FULL_SCALE
    return {
        "bed_left": bed[0], "bed_right": bed[1],
        "calls": [samples / FULL_SCALE for _, samples in sound.calls],
        "names": [call for call, _ in sound.calls],
        "weights": sound.weights.astype(np.float32),
        "gap": list(sound.gap),
        "moving": sorted(ambience.MOVING),
    }
