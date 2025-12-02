import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";
import { resetAnimationState } from "./utils.js";

let exportModal,
  exportStatus,
  exportProgressBar,
  exportDetails,
  closeExportModalBtn;
let exportAbort = null;
let currentGif = null;
let currentCleanup = null;

function initModalElements() {
  if (!exportModal) {
    exportModal = document.getElementById("exportModal");
    exportStatus = document.getElementById("exportStatus");
    exportProgressBar = document.getElementById("exportProgressBar");
    exportDetails = document.getElementById("exportDetails");
    closeExportModalBtn = document.getElementById("closeExportModal");
  }
}

async function createWorkerBlob() {
  const response = await fetch(
    "https://cdn.jsdelivr.net/npm/gif.js@0.2.0/dist/gif.worker.js"
  );
  if (!response.ok) throw new Error(`Worker fetch failed: ${response.status}`);
  const workerCode = await response.text();
  return URL.createObjectURL(
    new Blob([workerCode], { type: "application/javascript" })
  );
}

function showExportModal() {
  initModalElements();
  if (!exportModal) return;
  try {
    const z =
      getComputedStyle(document.documentElement)
        .getPropertyValue("--z-modal")
        .trim() || 2000;
    exportModal.style.cssText = `display: flex; z-index: ${z}; pointer-events: auto;`;
    exportModal.offsetWidth;
    exportModal.classList.add("visible");
    exportModal.setAttribute("aria-hidden", "false");
    const mc = exportModal.querySelector(".modalContent");
    if (mc) {
      mc.style.transform = "translateY(0) scale(1)";
      mc.style.opacity = "1";
    }
  } catch (e) {}
}

function hideExportModal() {
  if (!exportModal) return;
  exportModal.classList.remove("visible");
  try {
    const mc = exportModal.querySelector(".modalContent");
    if (mc) {
      mc.style.transform = "";
      mc.style.opacity = "";
    }
  } catch (e) {}
  setTimeout(() => {
    try {
      exportModal.style.display = "none";
      exportModal.setAttribute("aria-hidden", "true");
    } catch (e) {}
  }, 300);
}

function updateExportProgress(progress, status, details = "") {
  try {
    initModalElements();
    if (!exportProgressBar && !exportStatus && !exportDetails) return;
    if (exportProgressBar) {
      exportProgressBar.style.transition = "width 0.12s linear";
      exportProgressBar.style.width = `${progress}%`;
      void exportProgressBar.offsetWidth;
    }
    if (exportStatus) exportStatus.textContent = status;
    if (exportDetails) exportDetails.textContent = details;
  } catch (e) {}
}

async function captureMapFrame() {
  const mc = S.map?.getContainer();
  if (!mc) throw new Error("Map container not found");
  try {
    return await html2canvas(mc, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: null,
      logging: false,
      scale: 1,
      width: mc.offsetWidth,
      height: mc.offsetHeight,
    });
  } catch (e) {
    if (e.message?.includes("tainted") || e.message?.includes("CORS"))
      throw new Error("CORS_ERROR");
    throw e;
  }
}

export async function exportAnimationAsGif() {
  if (typeof GIF === "undefined" || typeof html2canvas === "undefined") {
    return alert("GIF.js or html2canvas missing.");
  }
  if (!S.currentMST?.length) {
    return alert("No MST animation to export.");
  }

  showExportModal();
  updateExportProgress(0, "Initializing...", "");
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));

  let workerUrl = null;
  const cleanup = () => {
    try {
      S.mstLayerGroup?.clearLayers();
    } catch (e) {}
    try {
      S.highlightMarkers?.forEach((h) => S.map.removeLayer(h));
    } catch (e) {}
    S.highlightMarkers = [];
    try {
      S.map.dragging?.enable();
      S.map.touchZoom?.enable();
      S.map.doubleClickZoom?.enable();
      S.map.scrollWheelZoom?.enable();
      S.map.boxZoom?.enable();
      S.map.keyboard?.enable();
      S.map.tap?.enable();
    } catch (e) {}
    document.body.classList.remove("exporting-gif");
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    // release gif/abort state (do not re-create animation here — use central reset)
    try {
      if (currentGif && typeof currentGif.abort === "function")
        currentGif.abort();
    } catch (e) {}
    exportAbort = null;
    try {
      S.exportingGif = false;
    } catch (e) {}
    currentGif = null;
    currentCleanup = null;
  };

  try {
    exportAbort = { aborted: false };
    S.exportingGif = true;
    currentCleanup = cleanup;
    S.map.dragging?.disable();
    S.map.touchZoom?.disable();
    S.map.doubleClickZoom?.disable();
    S.map.scrollWheelZoom?.disable();
    S.map.boxZoom?.disable();
    S.map.keyboard?.disable();
    S.map.tap?.disable();
    S.mstLayerGroup?.clearLayers();
    S.highlightMarkers?.forEach((h) => S.map.removeLayer(h));
    S.highlightMarkers.length = 0;
    document.body.classList.add("exporting-gif");

    await new Promise((r) => setTimeout(r, 100));
    updateExportProgress(5, "Loading Encoder...", "");

    workerUrl = await createWorkerBlob();
    if (exportAbort?.aborted || !S.exportingGif) {
      // user cancelled while loading encoder
      cleanup();
      hideExportModal();
      return;
    }
    const cfg = S.CFG.GIF_EXPORT;
    const req = [
      "WORKERS",
      "QUALITY",
      "INITIAL_FRAME_DELAY_MS",
      "FINAL_FRAME_DELAY_MS",
    ];
    if (!cfg || !req.every((k) => cfg[k] !== undefined))
      throw new Error("Invalid GIF config");
    if (S.animationDelay == null) throw new Error("Animation speed unknown");

    const mc = S.map.getContainer();
    let gif = new GIF({
      workers: cfg.WORKERS,
      quality: cfg.QUALITY,
      workerScript: workerUrl,
      width: mc.offsetWidth,
      height: mc.offsetHeight,
    });
    currentGif = gif;

    const firstFrame = await captureMapFrame();
    if (exportAbort?.aborted || !S.exportingGif) {
      cleanup();
      hideExportModal();
      return;
    }
    gif.addFrame(firstFrame, {
      delay: cfg.INITIAL_FRAME_DELAY_MS,
    });

    Anim.stopAnimation();
    Render.clearMSTLayers();
    S.animIndex = 0;
    Anim.clearCurrentEdgeAnim();
    if (exportAbort?.aborted || !S.exportingGif) {
      cleanup();
      hideExportModal();
      return;
    }
    Anim.startAnimation();

    const maxFrames = Number(cfg.MAX_CAPTURE_FRAMES ?? 200);
    const buffer = [];
    const start = performance.now();

    while (S.animateRafId && buffer.length < maxFrames) {
      if (exportAbort?.aborted) break;
      await new Promise((r) => setTimeout(r, 16));
      try {
        buffer.push(await captureMapFrame());
        updateExportProgress(
          5 + (buffer.length / Math.max(1, S.currentMST.length)) * 60,
          "Capturing...",
          `${buffer.length} frames`
        );
        await new Promise((r) => setTimeout(r, 0));
      } catch (e) {
        if (e.message === "CORS_ERROR") throw e;
      }
    }

    const duration = Math.max(0, performance.now() - start);
    if (!buffer.length) buffer.push(await captureMapFrame());

    const maxMult = Number(cfg.MAX_MULTIPLIER ?? 8);
    const maxBlend = Number(cfg.MAX_BLEND_STEPS ?? 6);
    const targetFPS = Number(cfg.TARGET_FPS ?? 240);
    const capFPS = Math.max(
      1,
      Math.round((buffer.length / Math.max(1, duration)) * 1000)
    );
    let mult = Math.min(maxMult, Math.max(1, Math.ceil(targetFPS / capFPS)));

    const extended = [];
    const blend = (a, b, s) => {
      const out = [],
        act = Math.min(s, maxBlend);
      const cv = document.createElement("canvas"),
        ctx = cv.getContext("2d");
      cv.width = a.width;
      cv.height = a.height;
      for (let k = 0; k < act; k++) {
        const t = (k + 1) / (act + 1);
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(a, 0, 0);
        ctx.globalAlpha = t;
        ctx.drawImage(b, 0, 0);
        ctx.globalAlpha = 1;
        const c = document.createElement("canvas");
        c.width = cv.width;
        c.height = cv.height;
        c.getContext("2d").drawImage(cv, 0, 0);
        out.push(c);
      }
      return out;
    };

    if (exportAbort?.aborted) throw new Error("ABORTED");
    for (let i = 0; i < buffer.length - 1; i++) {
      extended.push(buffer[i]);
      if (mult > 1) extended.push(...blend(buffer[i], buffer[i + 1], mult - 1));
      if (i % 8 === 0) {
        updateExportProgress(5 + (i / buffer.length) * 60, "Processing...", "");
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    extended.push(buffer[buffer.length - 1]);

    const delay = Math.max(1, Math.round(duration / extended.length));
    if (exportAbort?.aborted) throw new Error("ABORTED");
    for (let i = 0; i < extended.length; i++) {
      gif.addFrame(extended[i], { delay });
      if (i % 8 === 0) {
        updateExportProgress(
          65 + (i / extended.length) * 5,
          "Building GIF...",
          `Frame ${i + 1}/${extended.length}`
        );
        await new Promise((r) => setTimeout(r, 0));
      }
      extended[i] = null;
    }
    buffer.length = 0;

    gif.addFrame(await captureMapFrame(), { delay: cfg.FINAL_FRAME_DELAY_MS });

    if (exportAbort?.aborted) throw new Error("ABORTED");
    updateExportProgress(70, "Encoding...", "");
    gif.on("progress", (p) =>
      updateExportProgress(
        70 + p * 25,
        "Encoding...",
        `${Math.round(p * 100)}%`
      )
    );
    gif.on("finished", (b) => {
      updateExportProgress(100, "Done!", "Downloading...");
      const u = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = u;
      a.download = `mst-anim-${Date.now()}.gif`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(u);
      cleanup();
      setTimeout(hideExportModal, 1500);
    });
    gif.render();
  } catch (e) {
    cleanup();
    hideExportModal();
    if (e.message === "ABORTED") return;
    alert(
      e.message === "CORS_ERROR"
        ? "CORS error on map tiles."
        : `Export failed: ${e.message}`
    );
  }
}

export function initExportModal() {
  initModalElements();
  if (closeExportModalBtn)
    closeExportModalBtn.addEventListener("click", () => {
      if (exportAbort) {
        // call the shared reset routine directly to stop everything
        try {
          resetAnimationState();
        } catch (e) {}
        exportAbort.aborted = true;
        try {
          if (currentGif && typeof currentGif.abort === "function")
            currentGif.abort();
        } catch (e) {}
        try {
          currentCleanup && currentCleanup();
        } catch (e) {}
        hideExportModal();
      } else hideExportModal();
    });
}
