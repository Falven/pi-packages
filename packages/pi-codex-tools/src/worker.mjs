import { parentPort, workerData } from "node:worker_threads";
import { createContext, runInContext, SourceTextModule } from "node:vm";

const port = parentPort;
const { source, tools, values, credits } = workerData;
const capacity = new Int32Array(credits);
const timers = new Map();
const send = Object.setPrototypeOf((message) => {
  const bytes = Buffer.byteLength(message);
  if (bytes > 8 * 1024 * 1024) return "Worker message exceeds 8 MiB";
  for (;;) {
    const available = Atomics.load(capacity, 0);
    if (available >= bytes) break;
    Atomics.wait(capacity, 0, available);
  }
  Atomics.sub(capacity, 0, bytes);
  try {
    port.postMessage(message);
    return undefined;
  } catch {
    Atomics.add(capacity, 0, bytes);
    return "Execution host is unavailable";
  }
}, null);
const schedule = Object.setPrototypeOf((id, delay) => {
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      bridge.fire(id);
    }, delay),
  );
}, null);
const cancel = Object.setPrototypeOf((id) => {
  clearTimeout(timers.get(id));
  timers.delete(id);
}, null);
const bridgeSource = `${import.meta.url}#bridge`;
const stackSources = new Set([
  import.meta.url,
  bridgeSource,
  "node:internal/vm/module",
  "node:internal/process/task_queues",
  "node:internal/timers",
]);
// The worker fallback also formats cached stacks without replacing the VM's own hook.
const prepareStack = Error.prepareStackTrace;
Error.prepareStackTrace = (value, frames) =>
  prepareStack(
    value,
    frames.filter((frame, index) => {
      const file = frame.getFileName();
      return (
        !stackSources.has(file) &&
        !(
          file === null &&
          frame.getFunctionName() === "stringify" &&
          frames[index + 1]?.getFileName() === bridgeSource
        )
      );
    }),
  );
const context = createContext(Object.create(null));
const createBridge = runInContext(
  `((send, schedule, cancel, definitions, stored) => {
    "use strict";
    delete globalThis.console;
    let nextId = 0;
    let nextTimer = 0;
    let ended = false;
    const pending = new Map();
    const childResults = new WeakMap();
    const callbacks = new Map();
    const values = new Map(JSON.parse(stored));
    const writes = new Map();
    const finish = Symbol();
    const bytes = value => {
      let count = 0;
      for (const char of value) {
        const code = char.codePointAt(0);
        count += code <= 127 ? 1 : code <= 2047 ? 2 : code <= 65535 ? 3 : 4;
      }
      return count;
    };
    let storedBytes = Array.from(values, ([key, value]) => bytes(key) + bytes(value))
      .reduce((sum, size) => sum + size, 0);
    const post = message => {
      if (ended) throw finish;
      const error = send(JSON.stringify(message));
      if (error) throw new Error(error);
    };
    const stringify = value => {
      if (typeof value === "string") return value;
      let result;
      try { result = JSON.stringify(value); } catch { return String(value); }
      return result === undefined ? "undefined" : result;
    };
    const settle = (type, message) => {
      if (ended) return;
      post({ type, message, writes: Array.from(writes) });
      ended = true;
      for (const id of callbacks.keys()) cancel(id);
      callbacks.clear();
    };
    const errorText = error => {
      if (error === finish || ended) return finish;
      let stack;
      if (error !== null && (typeof error === "object" || typeof error === "function")) {
        try { stack = error.stack; } catch { /* An unavailable stack falls back to the thrown value. */ }
      }
      if (ended) return finish;
      let message = "";
      try { message = typeof stack === "string" ? stack : String(error); } catch { /* V8 string conversion can fail. */ }
      return ended ? finish : message;
    };
    const failed = error => {
      const message = errorText(error);
      if (message !== finish) settle("error", message);
    };
    globalThis.text = value => post({ type: "text", text: stringify(value), owner: value !== null && typeof value === "object" ? childResults.get(value) : undefined });
    globalThis.notify = value => post({ type: "notify", text: stringify(value) });
    globalThis.exit = () => {
      settle("done");
      throw finish;
    };
    globalThis.store = (key, value) => {
      if (typeof key !== "string") throw new TypeError("Stored keys must be strings");
      let serialized;
      try { serialized = JSON.stringify(value); } catch (error) { throw errorText(error); }
      if (serialized === undefined)
        throw 'Unable to store "' + key + '". Only plain serializable objects can be stored.';
      const size = bytes(key) + bytes(serialized);
      if (size > 256 * 1024) throw new Error("Stored value exceeds 256 KiB");
      const previous = values.get(key);
      const total = storedBytes + size - (previous === undefined ? 0 : bytes(key) + bytes(previous));
      if (total > 1024 * 1024 || (!values.has(key) && values.size >= 128))
        throw new Error("Stored values exceed the session limit");
      storedBytes = total;
      values.set(key, serialized);
      writes.set(key, serialized);
    };
    globalThis.load = key => {
      const value = values.get(key);
      return value === undefined ? undefined : JSON.parse(value);
    };
    globalThis.setTimeout = (callback, delay = 0) => {
      if (typeof callback !== "function") throw new TypeError("Timer callback must be a function");
      if (callbacks.size >= 256) throw new Error("Execution has too many timers");
      const id = ++nextTimer;
      callbacks.set(id, callback);
      schedule(id, Number(delay));
      return id;
    };
    globalThis.clearTimeout = id => {
      callbacks.delete(id);
      cancel(id);
    };
    globalThis.yield_control = async () => post({ type: "yield" });
    globalThis.image = (value, detail) => {
      if (detail != null && typeof detail !== "string")
        throw "image detail must be a string when provided";
      const url = typeof value === "string" ? value : value?.image_url;
      const embedded = typeof value !== "string" && typeof url === "string" ? value?.detail : undefined;
      if (embedded != null && typeof embedded !== "string")
        throw "image detail must be a string when provided";
      if (typeof url !== "string" || url.length === 0)
        throw "image expects a non-empty image URL string or an object with image_url and optional detail";
      if (/^https?:/i.test(url))
        throw "Tool call failed: remote image URLs are not supported in tool outputs. Pass a base64 data URI instead";
      if (!/^data:/i.test(url))
        throw "Tool call failed: invalid image output. Pass a base64 data URI instead";
      const selected = (detail ?? embedded)?.replace(/[A-Z]/g, letter => letter.toLowerCase());
      if (selected !== undefined && !["auto", "low", "high", "original"].includes(selected))
        throw "image detail must be one of: auto, low, high, original";
      post({ type: "image", url, detail: selected, owner: value !== null && typeof value === "object" ? childResults.get(value) : undefined });
    };
    globalThis.ALL_TOOLS = JSON.parse(definitions);
    globalThis.tools = Object.fromEntries(ALL_TOOLS.map(({ name }) => [name,
      args => new Promise((resolve, reject) => {
        if (pending.size >= 32) throw new Error("Execution has too many pending tool calls");
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        try { post({ type: "call", id, name, args }); }
        catch (error) { pending.delete(id); reject(error); }
      }),
    ]));
    return {
      receive(serialized) {
        const message = JSON.parse(serialized);
        const request = pending.get(message.id);
        if (!request || ended) return;
        pending.delete(message.id);
        post({ type: "received", id: message.id });
        if (message.error !== undefined) request.reject(message.error);
        else {
          if (message.result !== null && typeof message.result === "object") childResults.set(message.result, message.id);
          request.resolve(message.result);
        }
      },
      fire(id) {
        const callback = callbacks.get(id);
        callbacks.delete(id);
        if (!callback || ended) return;
        try { Promise.resolve(callback()).catch(failed); } catch (error) { failed(error); }
      },
      completed() { settle("done"); },
      failed,
    };
  })`,
  context,
  { filename: bridgeSource },
);
const bridge = createBridge(send, schedule, cancel, JSON.stringify(tools), JSON.stringify(values));
port.on("message", (message) => bridge.receive(message));
let module;
try {
  module = new SourceTextModule(source, {
    context,
    identifier: "exec_main.mjs",
    importModuleDynamically() {
      throw "unsupported import in exec";
    },
  });
} catch (error) {
  // Compilation has no user stack; Node's VM constructor frames are host implementation details.
  bridge.failed(String(error));
}
if (module) {
  try {
    await module.link(() => {
      throw "unsupported import in exec";
    });
    await module.evaluate();
    bridge.completed();
  } catch (error) {
    bridge.failed(error);
  }
}
