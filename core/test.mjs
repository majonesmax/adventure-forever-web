// Load the ROM, run frames with the joystick pushed, and print the 128 bytes - the proof the core works.
import { readFileSync } from "node:fs";
import createStella from "./stella.js";

const romPath = process.argv[2];
const stella = await createStella();
stella._af_init();
const rom = readFileSync(romPath);
const romPtr = stella._malloc(rom.length);
stella.HEAPU8.set(rom, romPtr);
if (!stella._af_load(romPtr, rom.length)) throw new Error("core refused the ROM");
console.log(`fps ${stella._af_fps()}  sample rate ${stella._af_sample_rate()}  ram bytes ${stella._af_ram_size()}`);

const ram = () => stella.HEAPU8.subarray(stella._af_ram(), stella._af_ram() + 128);
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
const JOY_START = 3, JOY_RIGHT = 7;

for (let i = 0; i < 60; i++) stella._af_run();
console.log("after 60 frames, title screen:");
console.log(hex(ram()));
console.log(`frame ${stella._af_frame_width()}x${stella._af_frame_height()} pitch ${stella._af_frame_pitch()} pixel format ${stella._af_pixel_format()}  audio frames/run ${stella._af_audio_frames()}`);

stella._af_set_joy(1 << JOY_START);              // reset switch: start the game
for (let i = 0; i < 10; i++) stella._af_run();
stella._af_set_joy(0);
for (let i = 0; i < 60; i++) stella._af_run();
const before = Array.from(ram());
stella._af_set_joy(1 << JOY_RIGHT);              // walk right for a second
for (let i = 0; i < 60; i++) stella._af_run();
stella._af_set_joy(0);
const after = Array.from(ram());
console.log("hero ($8A room, $8B x, $8C y) before walking right:", hex(before.slice(0x0A, 0x0D)), "after:", hex(after.slice(0x0A, 0x0D)));

const t0 = performance.now();
for (let i = 0; i < 600; i++) stella._af_run();
const ms = performance.now() - t0;
console.log(`600 frames in ${ms.toFixed(0)} ms = ${(ms / 600).toFixed(2)} ms/frame (budget 16.7)`);
