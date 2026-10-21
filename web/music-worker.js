// The music worker: a second Pyodide, with Adventure Forever's own song code, making each area's song on the
// look's band when the page asks. Messages in: {look, area}. Out: {type: "ready"} once loaded, then
// {type: "song", look, area, loop, rate, left, right} per request (float samples, transferred).
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/";
const { loadPyodide } = await import(PYODIDE + "pyodide.mjs");

const pyodide = await loadPyodide({ indexURL: PYODIDE });
await pyodide.loadPackage(["numpy"]);
const source = await (await fetch(new URL("adventure-forever.zip", import.meta.url))).arrayBuffer();
pyodide.FS.mkdir("/adventure-forever");
pyodide.unpackArchive(source, "zip", { extractDir: "/adventure-forever" });
pyodide.runPython("import sys; sys.path.insert(0, '/adventure-forever')");
pyodide.runPython(await (await fetch(new URL("music_worker.py", import.meta.url))).text());
const render = pyodide.globals.get("render");
const rate = pyodide.runPython("music.RATE");

onmessage = ({ data: { look, area } }) => {
  const result = render(look, area);                  // (left, right, loop) as a Python tuple
  const [leftProxy, rightProxy, loop] = [result.get(0), result.get(1), result.get(2)];
  const copy = (proxy) => { const view = proxy.getBuffer("f32"); const samples = view.data.slice(); view.release(); proxy.destroy(); return samples; };
  const left = copy(leftProxy), right = copy(rightProxy);
  result.destroy();
  postMessage({ type: "song", look, area, loop, rate, left, right }, [left.buffer, right.buffer]);
};
postMessage({ type: "ready" });
