// The page, played by a real browser: opens it in headless Chrome, waits, presses Enter (Reset) and holds
// Right for a second, and prints the status line and the hero's position each time. The hero must move and
// the frame rate must hold - a page error in the frame loop (sound, drawing) shows up here as a hero who
// never moves. Needs a local server with the built page and a ROM copy next to it (never committed):
//
//   cp /path/to/adventure.a26 out/ && (cd out && python3 -m http.server 8766)
//   node tools/drive.mjs "http://127.0.0.1:8766/index.html?rom=adventure.a26"
//
// Or give a ROM path as the second argument and it goes in through the page's file picker, which also
// works against the live site:  node tools/drive.mjs https://majonesmax.github.io/adventure-forever-web/ /path/to/adventure.a26
//
// CHROME names the browser binary (default: Chrome on macOS); the profile goes in a temporary folder.
// SHOT=folder saves a screenshot of each look on a page that has them.
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const [url, romPath] = [process.argv[2], process.argv[3]];
const { spawn } = await import("node:child_process");
const profile = mkdtempSync(join(tmpdir(), "adventure-forever-web-"));
const chrome = spawn(CHROME,
  ["--headless=new", "--disable-gpu", "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=0", "--user-data-dir=" + profile, url], { stdio: "ignore" });
process.on("exit", () => chrome.kill());   // never leave a browser behind, whatever happens below
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Chrome picks a free port and writes it to the profile: no clash with another run still going.
let port = 0, targets = [];
for (let i = 0; i < 60 && !targets.length; i++) {
  await sleep(500);
  const portFile = join(profile, "DevToolsActivePort");
  if (!port && existsSync(portFile)) port = Number(readFileSync(portFile, "utf8").split("\n")[0]);
  if (port) try { targets = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).filter((t) => t.type === "page" && t.url.startsWith(url.split("?")[0])); } catch {}
}
if (!targets.length) throw new Error("the page never opened");
const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r) => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); } else if (d.method === "Runtime.consoleAPICalled" || d.method === "Runtime.exceptionThrown") console.log("  console:", d.method === "Runtime.exceptionThrown" ? (d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 4000) : JSON.stringify(d.params.args?.map((a) => a.value)).slice(0, 300)); };
const send = (method, params = {}) => new Promise((r) => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
await send("Runtime.enable");
const read = async () => (await send("Runtime.evaluate", { expression: "document.getElementById('status').textContent + ' | ' + document.getElementById('ram').textContent.split('\\n').pop()", returnByValue: true })).result.value ?? "";   // the page may not be there yet
if (romPath) {   // the file picker, as a player would use it - once the page says the core is ready
  for (let i = 0; i < 60 && !(await read()).startsWith("core ready"); i++) await sleep(500);
  const { root } = await send("DOM.getDocument");
  const { nodeId } = await send("DOM.querySelector", { nodeId: root.nodeId, selector: "#rom" });
  await send("DOM.setFileInputFiles", { nodeId, files: [romPath] });
}
for (let i = 0; i < 120 && !(await read()).startsWith("running"); i++) await sleep(500);   // Python pages load for a while
await sleep(1500); console.log("  running:          ", await read());
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await sleep(300);
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await sleep(1000);
console.log("  after Enter:      ", await read());
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); await sleep(1000);
await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); await sleep(1500);
console.log("  after Right 1 s:  ", await read());
// A page with looks (#showing): L cycles them, each one's name and cost reported.
const hasLooks = (await send("Runtime.evaluate", { expression: "!!document.getElementById('showing')", returnByValue: true })).result.value;
for (let i = 0; hasLooks && i < 4; i++) {
  if (i > 0) {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "l", code: "KeyL", windowsVirtualKeyCode: 76 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "l", code: "KeyL", windowsVirtualKeyCode: 76 });
    await sleep(2500);
  }
  const showing = (await send("Runtime.evaluate", { expression: "document.getElementById('showing').textContent", returnByValue: true })).result.value;
  console.log(`  look ${showing}:`.padEnd(22), (await read()).split(" | ")[0]);
  if (process.env.SHOT) {   // SHOT=folder: a screenshot of each look
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(process.env.SHOT, `look-${i}.png`), Buffer.from(data, "base64"));
  }
}
ws.close(); chrome.kill();
