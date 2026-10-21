// The page, played by a real browser: opens it in headless Chrome, waits, presses Enter (Reset) and holds
// Right for a second, and prints the status line and the hero's position each time. The hero must move and
// the frame rate must hold - a page error in the frame loop (sound, drawing) shows up here as a hero who
// never moves. Needs a local server with the built page and a ROM copy next to it (never committed):
//
//   cp /path/to/adventure.a26 out/ && (cd out && python3 -m http.server 8766)
//   node tools/drive.mjs "http://127.0.0.1:8766/index.html?rom=adventure.a26"
//
// CHROME names the browser binary (default: Chrome on macOS); the profile goes in a temporary folder.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [url, port] = [process.argv[2], 9333];
const { spawn } = await import("node:child_process");
const chrome = spawn(CHROME,
  ["--headless=new", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", `--remote-debugging-port=${port}`, "--user-data-dir=" + mkdtempSync(join(tmpdir(), "adventure-forever-web-")), url], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = [];
for (let i = 0; i < 30 && !targets.length; i++) { await sleep(500); try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled" || d.method === "Runtime.exceptionThrown") console.log("  console:", JSON.stringify(d.params).slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable");
const read = async () => (await send("Runtime.evaluate", { expression: "document.getElementById('status').textContent + ' | ' + document.getElementById('ram').textContent.split('\\n').pop()", returnByValue: true })).result.value;
await sleep(3000); console.log("  after 3 s:        ", await read());
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await sleep(300);
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await sleep(1000);
console.log("  after Enter:      ", await read());
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); await sleep(1000);
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); await sleep(1500);
console.log("  after Right 1 s:  ", await read());
ws.close(); chrome.kill();
