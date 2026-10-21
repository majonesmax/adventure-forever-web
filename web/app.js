// The app around the game: the start screen (your ROM, remembered), then the game with the desktop's keys:
// L C W the look, cast and world; I what's showing; V the view; F fullscreen; M - = the music; P pause;
// D the debug line; S a screenshot; H help; Esc back to the start.
import { Atari, demoJoy } from "./atari.js";
import { Music } from "./music.js";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
const ROM_KEY = "adventure-forever.rom";      // the ROM, remembered in this browser only
const VIEWS = ["look", "both", "2600", "grid"];
export const KEYS = [   // what the help panel lists (the desktop's list, less what the browser doesn't do yet)
  ["PLAY", [["Arrows", "move"], ["Space", "fire: drop what you carry"], ["Tab", "game select (games 1-3)"], ["Enter", "game reset: start"]]],
  ["WHAT YOU SEE", [["L", "next look: NES, SNES, VGA, paper"], ["C", "next cast: the knight, PBJ and friends"], ["W", "next world: castles, kingdoms"],
                    ["I", "which look, cast and world"], ["V", "view: look, side by side, 2600, grid"], ["F", "fullscreen on / off"]]],
  ["SOUND", [["M", "music on / off"], ["- / =", "music quieter / louder"]]],
  ["MORE", [["S", "screenshot"], ["D", "debug line: speed, render time"], ["P", "pause"], ["H", "help: every key"], ["Esc", "back to the start"]]],
];

const $ = (id) => document.getElementById(id);
const demo = new URLSearchParams(location.search).has("demo");

// --- the start screen: the ROM ---------------------------------------------------------------------------
function savedRom() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROM_KEY));
    return saved ? { name: saved.name, bytes: Uint8Array.from(atob(saved.data), (c) => c.charCodeAt(0)) } : null;
  } catch { return null; }
}
function saveRom(name, bytes) {
  try { localStorage.setItem(ROM_KEY, JSON.stringify({ name, data: btoa(String.fromCharCode(...bytes)) })); } catch {}
}
let rom = savedRom();
function showRom() {
  $("rom-name").textContent = rom ? `${rom.name} (${rom.bytes.length} bytes)` : "no ROM chosen yet";
  $("play").disabled = !(rom && loaded);
  $("play").textContent = !rom ? "Choose your ROM first" : loaded ? "Play" : "Loading the emulator…";
}
$("rom").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  rom = { name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) };
  saveRom(rom.name, rom.bytes);
  showRom();
});
$("forget").addEventListener("click", () => { try { localStorage.removeItem(ROM_KEY); } catch {} rom = null; showRom(); });
$("play").addEventListener("click", () => play());
$("help-list").innerHTML = KEYS.map(([title, rows]) => `<h4>${title}</h4>` + rows.map(([k, what]) => `<div><kbd>${k}</kbd> ${what}</div>`).join("")).join("");
$("help").innerHTML = $("help-list").innerHTML;

// --- the emulator and the Python, loading while the start screen shows ----------------------------------
let loaded = false, atari, python, music;
showRom();
const status = $("status");
status.textContent = "loading the core and Python…";
music = new Music();
[atari, python] = await Promise.all([Atari.create(), loadPython()]);
async function loadPython() {
  const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");
  const pyodide = await loadPyodide({ indexURL: PYODIDE });
  await pyodide.loadPackage(["numpy", "pillow"]);
  const source = await (await fetch("adventure-forever.zip")).arrayBuffer();
  pyodide.FS.mkdir("/adventure-forever");
  pyodide.unpackArchive(source, "zip", { extractDir: "/adventure-forever" });
  pyodide.runPython("import sys; sys.path.insert(0, '/adventure-forever')");
  pyodide.runPython(await (await fetch("web_game.py")).text());
  const fn = (name) => pyodide.globals.get(name);
  return { start: fn("start"), draw: fn("draw"), nextLook: fn("next_look"), nextCast: fn("next_cast"), nextWorld: fn("next_world"),
           showing: fn("showing"), musicArea: fn("music_area"), lookKey: () => pyodide.globals.get("look_key") };
}
loaded = true;
status.textContent = "core ready - choose your adventure.a26";
showRom();

// --- the game ------------------------------------------------------------------------------------------
let running = false, paused = false, view = VIEWS[0], total = 0;
let frames = 0, busyCore = 0, busyLook = 0, lastReport = 0;
const lookCanvas = $("look"), lookContext = lookCanvas.getContext("2d"), canvas2600 = $("screen"), ramView = $("ram");

function play() {
  if (!rom || !loaded || running) return;
  if (!atari.load(rom.bytes)) { $("rom-name").textContent = "the core refused that file"; return; }
  try { $("showing").textContent = python.start(rom.bytes); }
  catch (error) { $("rom-name").textContent = "Python: " + error; throw error; }
  atari.attachKeyboard(); atari.attachSound(); music.attachKeys(); atari.wakeAudio();
  $("start").hidden = true; $("game").hidden = false;
  setView(view); nowShowing();
  running = true; total = 0;
  requestAnimationFrame(loop);
}

function loop() {
  if (!running) return;
  if (!paused) {
    try { frame(); } catch (error) { console.error("frame:", error); }   // one bad frame never stops the game
  }
  requestAnimationFrame(loop);
}

function frame() {
  const t0 = performance.now();
  atari.run(demo ? demoJoy(total) : atari.joyMask);
  if (view !== "look") atari.draw2600(canvas2600);
  const t1 = performance.now();
  if (view !== "2600") drawLook(total);
  const t2 = performance.now();
  if (view === "grid") ramView.textContent = atari.ramText();
  atari.playAudio();
  music.update(python.lookKey(), python.musicArea(), atari.audioContext);
  total++; frames++; busyCore += t1 - t0; busyLook += t2 - t1;
  if (t0 - lastReport > 1000) {
    status.textContent = `running: ${frames} frames/s, core ${(busyCore / frames).toFixed(2)} ms + look ${(busyLook / frames).toFixed(2)} ms per frame - ${atari.soundState} - ${music.state}`;
    frames = 0; busyCore = 0; busyLook = 0; lastReport = t0;
  }
}

function drawLook(frameNo) {
  const picture = python.draw(atari.ram, frameNo);      // a numpy array (240, 256, 4) in Python's memory
  const buffer = picture.getBuffer("u8clamped");
  lookContext.putImageData(new ImageData(buffer.data, 256, 240), 0, 0);
  buffer.release(); picture.destroy();
}

function setView(next) {
  view = next;
  $("game").dataset.view = view;
  if (view === "grid") ramView.textContent = atari.ramText();
}

let showingTimer = null;
function nowShowing(text) {
  if (text) $("showing").textContent = text;
  $("showing").classList.add("on");
  clearTimeout(showingTimer);
  showingTimer = setTimeout(() => $("showing").classList.remove("on"), 2500);
}

function change(step) {   // L, C, W: a look or pack that fails to load leaves the current one on screen
  try { nowShowing(step()); }
  catch (error) { nowShowing("that one didn't load (see the console)"); console.error(error); }
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else $("game").requestFullscreen().catch(() => {});
}

function screenshot() {
  const canvas = view === "2600" ? canvas2600 : lookCanvas;
  canvas.toBlob((blob) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.download = `adventure-forever-${Date.now()}.png`; link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });
}

function pause(on) {
  paused = on;
  $("paused").hidden = !on;
  if (atari.audioContext) on ? atari.audioContext.suspend() : atari.audioContext.resume();   // game sound and music alike
}

function quit() {
  running = false; pause(false); music.stop();
  if (document.fullscreenElement) document.exitFullscreen();
  $("game").hidden = true; $("start").hidden = false;
  status.textContent = "stopped - Play starts again (the game restarts)";
}

const ACTIONS = {
  l: () => change(python.nextLook), c: () => change(python.nextCast), w: () => change(python.nextWorld),
  i: () => nowShowing(), v: () => setView(VIEWS[(VIEWS.indexOf(view) + 1) % VIEWS.length]), f: toggleFullscreen,
  s: screenshot, d: () => status.classList.toggle("on"), p: () => pause(!paused), h: () => $("help").classList.toggle("on"),
  Escape: quit,
};
addEventListener("keydown", (event) => {
  if (!running || event.metaKey || event.ctrlKey || event.altKey) return;
  const action = ACTIONS[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (action) { action(); event.preventDefault(); }
});
$("fullscreen").addEventListener("click", toggleFullscreen);

const romUrl = new URLSearchParams(location.search).get("rom");   // for testing: fetched from the same server
if (romUrl) { rom = { name: romUrl, bytes: new Uint8Array(await (await fetch(romUrl)).arrayBuffer()) }; play(); }
