// The Atari in the browser: the Stella core (stella.js, built by core/build.sh), the keyboard as its
// joystick, the game's sound through Web Audio, the 2600's own picture on a canvas, and the 128 bytes as text.
// Both pages (index.html: the 2600 alone; looks.html: Adventure Forever's looks) are built on this.
import createStella from "./stella.js";

export const JOY = { B: 0, SELECT: 2, START: 3, UP: 4, DOWN: 5, LEFT: 6, RIGHT: 7 };
const KEYS = { ArrowUp: JOY.UP, ArrowDown: JOY.DOWN, ArrowLeft: JOY.LEFT, ArrowRight: JOY.RIGHT,
               " ": JOY.B, Enter: JOY.START, Shift: JOY.SELECT };

export class Atari {
  static async create() {
    const stella = await createStella();
    stella._af_init();
    return new Atari(stella);
  }

  constructor(stella) {
    this.stella = stella;
    this.joyMask = 0;
    this.sampleRate = 0;        // known once a ROM is loaded
    this.audioContext = null;
    this.audioCursor = 0;
  }

  // --- the ROM and the frames --------------------------------------------------------------------
  load(bytes) {
    const stella = this.stella;
    const pointer = stella._malloc(bytes.length);
    stella.HEAPU8.set(bytes, pointer);
    if (!stella._af_load(pointer, bytes.length)) return false;
    this.sampleRate = stella._af_sample_rate();
    return true;
  }

  run(joyMask) {
    this.stella._af_set_joy(joyMask);
    this.stella._af_run();
  }

  get ram() { return this.stella.HEAPU8.subarray(this.stella._af_ram(), this.stella._af_ram() + 128); }

  // --- the keyboard as the joystick -------------------------------------------------------------
  attachKeyboard() {
    addEventListener("keydown", (event) => {
      if (event.key in KEYS) { this.joyMask |= 1 << KEYS[event.key]; event.preventDefault(); }
    });
    addEventListener("keyup", (event) => { if (event.key in KEYS) this.joyMask &= ~(1 << KEYS[event.key]); });
  }

  // --- sound: each frame's samples queued as one small buffer at the core's own rate (the browser
  // resamples). Browsers only allow sound after a click or key press, so any of either wakes it. -------
  attachSound() {
    const wake = () => this.wakeAudio();
    addEventListener("click", wake);
    addEventListener("keydown", wake);
  }

  wakeAudio() {
    if (!this.audioContext) { try { this.audioContext = new AudioContext(); } catch { return; } }
    if (this.audioContext.state === "suspended") this.audioContext.resume();
  }

  get soundState() {
    return this.audioContext && this.audioContext.state === "running" ? "sound on" : "click or press a key for sound";
  }

  playAudio() {   // never lets a sound problem stop the game
    try { this.queueAudio(); } catch (error) { console.warn("sound stopped:", error); this.audioContext = null; }
  }

  queueAudio() {
    const { stella, audioContext, sampleRate } = this;
    if (!audioContext || audioContext.state !== "running" || !sampleRate) return;
    const frames = stella._af_audio_frames();
    if (!frames) return;
    const base = stella._af_audio() / 2;
    const buffer = audioContext.createBuffer(2, frames, sampleRate);
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
    const heap = stella.HEAP16 ?? new Int16Array(stella.HEAPU8.buffer);
    for (let i = 0; i < frames; i++) { left[i] = heap[base + i * 2] / 32768; right[i] = heap[base + i * 2 + 1] / 32768; }
    const source = audioContext.createBufferSource();
    source.buffer = buffer; source.connect(audioContext.destination);
    const now = audioContext.currentTime;
    if (this.audioCursor < now) this.audioCursor = now + 0.02;   // fell behind: start again a little ahead
    source.start(this.audioCursor); this.audioCursor += frames / sampleRate;
  }

  // --- the 2600's own picture ------------------------------------------------------------------
  draw2600(canvas) {
    const stella = this.stella;
    const width = stella._af_frame_width(), height = stella._af_frame_height(), pitch = stella._af_frame_pitch();
    if (!width) return;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    const context = canvas.getContext("2d");
    const image = context.createImageData(width, height);
    const pixels = stella.HEAPU8.subarray(stella._af_frame(), stella._af_frame() + height * pitch);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const from = y * pitch + x * 4, to = (y * width + x) * 4;   // XRGB8888 is stored blue, green, red, unused
        image.data[to] = pixels[from + 2]; image.data[to + 1] = pixels[from + 1]; image.data[to + 2] = pixels[from]; image.data[to + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
  }

  // --- the 128 bytes, as the page shows them ------------------------------------------------------
  ramText() {
    const ram = this.ram;
    const lines = [];
    for (let row = 0; row < 128; row += 16) {
      const hex = Array.from(ram.subarray(row, row + 16), (b) => b.toString(16).padStart(2, "0")).join(" ");
      lines.push(`$${(0x80 + row).toString(16).toUpperCase()}  ${hex}`);
    }
    lines.push("", `hero: room $${ram[0x0A].toString(16)}  x ${ram[0x0B]}  y ${ram[0x0C]}    carrying $${ram[0x1D].toString(16)}`);
    return lines.join("\n");
  }
}

// For headless testing (?demo): Reset, then walk right, by itself.
export function demoJoy(frame) {
  if (frame >= 10 && frame < 20) return 1 << JOY.START;
  if (frame >= 60 && frame < 150) return 1 << JOY.RIGHT;
  return 0;
}

// The ROM: the file picker, or for testing ?rom=<file> fetched from the same server (never committed).
export function romSource(input, onBytes) {
  input.addEventListener("change", async (event) => onBytes(new Uint8Array(await event.target.files[0].arrayBuffer())));
  const romUrl = new URLSearchParams(location.search).get("rom");
  if (romUrl) fetch(romUrl).then((r) => r.arrayBuffer()).then((buffer) => onBytes(new Uint8Array(buffer)));
}
