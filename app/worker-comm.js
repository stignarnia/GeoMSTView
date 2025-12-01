import { S } from "./state.js";

export function createWorker() {
  if (S.computeWorker) return S.computeWorker;
  // Resolve worker path relative to this module so it works when bundled
  S.computeWorker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  S.computeWorker._neighbors = [];
  S.computeWorker.addEventListener("error", (e) => {
    // Provide more info about worker load/runtime errors
    try {
      console.error("Worker error", e.message || e);
    } catch (err) {
      console.error("Worker error", e);
    }
  });
  return S.computeWorker;
}

export function setWorkerMessageHandler(handler) {
  if (!S.computeWorker) createWorker();
  S.computeWorker.onmessage = (ev) => handler(ev.data || {});
}

export function postComputeMessage(payload) {
  if (!S.computeWorker) createWorker();
  try {
    S.computeWorker.postMessage(payload);
  } catch (e) {
    console.error("Failed to post to worker", e);
  }
}
