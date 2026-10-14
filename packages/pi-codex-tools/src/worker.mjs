import { parentPort, workerData } from "node:worker_threads"
import { createContext, runInContext, SourceTextModule } from "node:vm"

const port = parentPort
const { source, tools } = workerData
const send = Object.setPrototypeOf((message) => {
  try {
    port.postMessage(message)
    return true
  } catch {
    return false
  }
}, null)
const context = createContext(Object.create(null))
const createBridge = runInContext(
  `((send, definitions) => {
    "use strict";
    delete globalThis.console;
    let nextId = 0;
    const pending = new Map();
    const finish = Symbol();
    const post = (message) => {
      if (!send(JSON.stringify(message))) throw new Error("Execution host is unavailable");
    };
    globalThis.text = (value) => {
      let text;
      if (typeof value === "string") text = value;
      else {
        try { text = JSON.stringify(value); } catch {}
        if (text === undefined) text = String(value);
      }
      post({ type: "text", text });
    };
    globalThis.exit = () => {
      post({ type: "exit" });
      throw finish;
    };
    globalThis.image = (value, detail) => {
      const url = typeof value === "string" ? value : value?.image_url;
      if (typeof url !== "string" || url.length === 0)
        throw "image expects a non-empty image URL string or an object with image_url and optional detail";
      if (!url.startsWith("data:"))
        throw "Tool call failed: invalid image output. Pass a base64 data URI instead";
      const selected = detail ?? value?.detail;
      if (selected !== undefined && selected !== null) {
        if (typeof selected !== "string") throw "image detail must be a string when provided";
        if (!["auto", "low", "high", "original"].includes(selected))
          throw "image detail must be one of: auto, low, high, original";
      }
      post({ type: "image", url, detail: selected });
    };
    globalThis.ALL_TOOLS = JSON.parse(definitions);
    globalThis.tools = Object.fromEntries(ALL_TOOLS.map(({ name }) => [name,
      (args) => new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        post({ type: "call", id, name, args });
      }),
    ]));
    return {
      receive(serialized) {
        const message = JSON.parse(serialized);
        const request = pending.get(message.id);
        if (!request) return;
        pending.delete(message.id);
        if (message.error !== undefined) request.reject(message.error);
        else request.resolve(message.result);
      },
      error(message) { return new Error(message); },
      completed() { post({ type: "done" }); },
      failed(error) {
        if (error === finish) return;
        post({ type: "error", message: error instanceof Error
          ? error.name + ": " + error.message : String(error) });
      },
    };
  })`,
  context,
)
const bridge = createBridge(send, JSON.stringify(tools))
port.on("message", (message) => bridge.receive(message))
try {
  const module = new SourceTextModule(source, {
    context,
    importModuleDynamically() {
      throw bridge.error("Module imports are not available")
    },
  })
  await module.link(() => {
    throw bridge.error("Module imports are not available")
  })
  await module.evaluate()
  bridge.completed()
} catch (error) {
  bridge.failed(error)
}
