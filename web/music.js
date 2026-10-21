// Background music, as on the desktop (engine/music.py): one song per area (title, overworld, dungeon,
// final, win), played by the look's band. The songs are made in a worker (music-worker.js) the first time
// they're needed and kept; switching looks in the same area keeps the place in the song. M turns the music
// off and on, - and = change its volume.
export class Music {
  constructor() {
    this.worker = new Worker(new URL("music-worker.js", import.meta.url), { type: "module" });
    this.ready = false;
    this.songs = new Map();      // "look/area" -> {left, right, loop, rate}
    this.asked = new Set();      // songs the worker is making
    this.wanted = null;          // {look, area} the game is in
    this.playing = null;         // {key, area, source, buffer, startedAt, offset}
    this.on = true;
    this.gain = 1.0;
    this.context = null;
    this.gainNode = null;
    this.worker.onerror = (event) => console.error("music worker:", event.message);
    this.worker.onmessage = ({ data }) => {
      if (data.type === "ready") { this.ready = true; return; }
      const key = `${data.look}/${data.area}`;
      this.songs.set(key, data);
      this.asked.delete(key);
    };
  }

  attachKeys() {
    addEventListener("keydown", (event) => {
      if (event.key === "m" || event.key === "M") this.toggle();
      if (event.key === "-") this.setGain(this.gain - 0.1);
      if (event.key === "=") this.setGain(this.gain + 0.1);
    });
  }

  toggle() {
    this.on = !this.on;
    if (!this.on) this.stop();
  }

  setGain(gain) {
    this.gain = Math.min(2, Math.max(0, Math.round(gain * 10) / 10));
    if (this.gainNode) this.gainNode.gain.value = this.gain;
  }

  // Every frame: the look and area on screen, and the sound context once the page has one.
  update(look, area, context) {
    if (context && context !== this.context) {
      this.context = context;
      this.gainNode = context.createGain(); this.gainNode.gain.value = this.gain;
      this.gainNode.connect(context.destination);
    }
    this.wanted = { look, area };
    const key = `${look}/${area}`;
    if (!this.songs.has(key)) {
      if (this.ready && !this.asked.has(key)) { this.asked.add(key); this.worker.postMessage({ look, area }); }
      return;
    }
    if (this.on && this.context && this.context.state === "running" && (!this.playing || this.playing.key !== key)) this.play(key, area);
  }

  play(key, area) {
    const song = this.songs.get(key);
    const buffer = song.buffer ?? this.makeBuffer(song);
    let offset = 0;
    if (this.playing && this.playing.area === area) offset = this.position() % buffer.duration;   // the same place, on another band
    this.stop();
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.loop = song.loop; source.connect(this.gainNode);
    source.start(0, offset);
    this.playing = { key, area, source, buffer, startedAt: this.context.currentTime, offset };
  }

  makeBuffer(song) {
    const buffer = this.context.createBuffer(2, song.left.length, song.rate);
    buffer.copyToChannel(song.left, 0); buffer.copyToChannel(song.right, 1);
    song.buffer = buffer;
    return buffer;
  }

  position() {   // seconds into the song playing
    return this.context.currentTime - this.playing.startedAt + this.playing.offset;
  }

  stop() {
    if (this.playing) { try { this.playing.source.stop(); } catch {} }
    this.playing = null;
  }

  get state() {
    if (!this.on) return "music off (M)";
    if (!this.wanted) return "music: -";
    const key = `${this.wanted.look}/${this.wanted.area}`;
    if (!this.songs.has(key)) return this.ready ? `music: making ${this.wanted.area}…` : "music: loading…";
    return this.playing ? `music: ${this.playing.area} on ${this.wanted.look}, volume ${this.gain.toFixed(1)}` : "music: ready";
  }
}
