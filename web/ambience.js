// The world's sounds, as on the desktop (engine/ambience.py): what you hear when no music plays - a breeze
// and birds in the meadow, drips in the catacombs - and always on paper, which has no band. A bed loops under
// everything and fades in and out as the music stops and starts, and from place to place; calls are dropped in
// at random moments, each placed left or right (a bee crosses). The sounds are made in the music worker.
const FPS = 60, FADE_SECONDS = 2.0;

export class Ambience {
  constructor(requestSound) {
    this.requestSound = requestSound;   // (name) => asks the worker; the sound arrives through add()
    this.sounds = new Map();            // name -> {bed (AudioBuffer once made), calls, names, weights, gap, moving}
    this.asked = new Set();
    this.context = null;
    this.master = null;                 // the beds' loudness: full when quiet, none under music
    this.name = null;                   // the sound playing now
    this.beds = new Map();              // name -> {source, gain} looping
    this.quiet = false;
    this.untilCall = FPS;
  }

  add(sound) { this.sounds.set(sound.name, sound); this.asked.delete(sound.name); }

  // Once a frame. name: the sound for where the game is (null: silence); quiet: no music playing.
  follow(name, quiet, context) {
    if (context && context !== this.context) {
      this.context = context;
      this.master = context.createGain(); this.master.gain.value = 0;
      this.master.connect(context.destination);
    }
    this.quiet = quiet && name !== null;
    if (name !== null && !this.sounds.has(name) && !this.asked.has(name)) { this.asked.add(name); this.requestSound(name); }
    if (!this.context || this.context.state !== "running") return;
    this.fadeTo(this.master.gain, this.quiet ? 1 : 0);
    if (name !== this.name) this.changeBed(name);
    this.countDownToCall();
  }

  fadeTo(param, target) {
    const now = this.context.currentTime;
    param.cancelScheduledValues(now); param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(target, now + FADE_SECONDS);
  }

  changeBed(name) {
    const sound = name === null ? null : this.sounds.get(name);
    if (name !== null && !sound) return;   // not made yet: keep the old bed until it is
    for (const [other, bed] of this.beds) {
      this.fadeTo(bed.gain.gain, 0);
      bed.source.stop(this.context.currentTime + FADE_SECONDS);
      this.beds.delete(other);
    }
    this.name = name;
    if (!sound) return;
    const gain = this.context.createGain(); gain.gain.value = 0; gain.connect(this.master);
    const source = this.context.createBufferSource();
    source.buffer = sound.bed ?? this.makeBed(sound); source.loop = true; source.connect(gain); source.start();
    this.beds.set(name, { source, gain });
    this.fadeTo(gain.gain, 1);
  }

  makeBed(sound) {
    const buffer = this.context.createBuffer(2, sound.bedLeft.length, sound.rate);
    buffer.copyToChannel(sound.bedLeft, 0); buffer.copyToChannel(sound.bedRight, 1);
    sound.bed = buffer;
    return buffer;
  }

  countDownToCall() {
    const sound = this.name === null ? null : this.sounds.get(this.name);
    if (!this.quiet || !sound) return;
    if (--this.untilCall > 0) return;
    const [low, high] = sound.gap;
    this.untilCall = Math.floor((low + Math.random() * (high - low)) * FPS);
    let pick = Math.random(), index = 0;
    while (index < sound.weights.length - 1 && (pick -= sound.weights[index]) > 0) index++;
    const pan = Math.random() * 1.6 - 0.8;
    const end = sound.moving.includes(sound.names[index]) ? -pan : pan;
    this.playCall(sound, index, pan, end);
  }

  playCall(sound, index, startPan, endPan) {
    const samples = sound.calls[index];
    const buffer = this.context.createBuffer(1, samples.length, sound.rate);
    buffer.copyToChannel(samples, 0);
    const panner = this.context.createStereoPanner();
    const now = this.context.currentTime, length = samples.length / sound.rate;
    panner.pan.setValueAtTime(startPan, now);
    panner.pan.linearRampToValueAtTime(endPan, now + length);
    panner.connect(this.master);
    const source = this.context.createBufferSource();
    source.buffer = buffer; source.connect(panner); source.start();
    source.onended = () => { source.disconnect(); panner.disconnect(); };
  }

  get state() {
    if (this.name === null) return "world: silence";
    const made = this.sounds.has(this.name);
    return `world: ${this.name}${made ? "" : " (making)"}${this.quiet ? "" : ", under the music"}`;
  }
}
