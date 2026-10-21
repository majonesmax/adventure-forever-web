// The music worker: a second Pyodide, with Adventure Forever's own song and nature code, making each area's
// song on the look's band and each world sound when the page asks. Messages in: {kind: "song", look, area}
// or {kind: "sound", name}. Out: {type: "ready", bands, rate} once loaded, then {type: "song", ...} or
// {type: "sound", ...} per request, the samples transferred.
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");

const pyodide = await loadPyodide({ indexURL: PYODIDE });
await pyodide.loadPackage(["numpy"]);
const source = await (await fetch(new URL("adventure-forever.zip", import.meta.url))).arrayBuffer();
pyodide.FS.mkdir("/adventure-forever");
pyodide.unpackArchive(source, "zip", { extractDir: "/adventure-forever" });
pyodide.runPython("import sys; sys.path.insert(0, '/adventure-forever')");
pyodide.runPython(await (await fetch(new URL("music_worker.py", import.meta.url))).text());
const render = pyodide.globals.get("render"), renderSound = pyodide.globals.get("render_sound");
const rate = pyodide.runPython("music.RATE");
const bands = pyodide.globals.get("bands")().toJs();

const copy = (proxy) => { const view = proxy.getBuffer("f32"); const samples = view.data.slice(); view.release(); proxy.destroy(); return samples; };

onmessage = ({ data }) => {
  if (data.kind === "song") {
    const result = render(data.look, data.area);                  // (left, right, loop)
    const left = copy(result.get(0)), right = copy(result.get(1)), loop = result.get(2);
    result.destroy();
    postMessage({ type: "song", look: data.look, area: data.area, loop, rate, left, right }, [left.buffer, right.buffer]);
  } else if (data.kind === "sound") {
    const result = renderSound(data.name);
    const bedLeft = copy(result.get("bed_left")), bedRight = copy(result.get("bed_right"));
    const callList = result.get("calls"), calls = [];
    for (let i = 0; i < callList.length; i++) calls.push(copy(callList.get(i)));
    callList.destroy();
    const names = result.get("names").toJs(), weights = copy(result.get("weights")), gap = result.get("gap").toJs(), moving = result.get("moving").toJs();
    result.destroy();
    postMessage({ type: "sound", name: data.name, rate, bedLeft, bedRight, calls, names, weights, gap, moving },
                [bedLeft.buffer, bedRight.buffer, ...calls.map((c) => c.buffer)]);
  }
};
postMessage({ type: "ready", bands, rate });
