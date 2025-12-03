import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";
import { resetAnimationState, readCachedBinary, writeCachedBinary } from "./utils.js";
import { progressManager } from "./progress-manager.js";
import { fetchWasm } from "./wasm-loader.js";

// 1. Libraries via NPM (as requested)
import { FFmpeg } from "@ffmpeg/ffmpeg";

// Constants
const FFMPEG_MAX_COLORS = 256;
const FFMPEG_BAYER_SCALE = 5;
const MIN_FPS = 1;

let exportModal, exportStatus, exportProgressBar, exportDetails, closeExportModalBtn;
let exportAbort = null;
let ffmpegInstance = null;
let currentCleanup = null;

function stopFFmpeg() {
  try {
    if (ffmpegInstance) {
      try {
        if (typeof ffmpegInstance.exit === "function") ffmpegInstance.exit();
        else if (typeof ffmpegInstance.terminate === "function") ffmpegInstance.terminate();
      } catch (e) { }
      ffmpegInstance = null;
    }
  } catch (e) { }
}

async function checkAbortAndThrow() {
  if (exportAbort?.aborted) {
    try {
      if (ffmpegInstance) {
        if (typeof ffmpegInstance.exit === "function") await ffmpegInstance.exit();
        else if (typeof ffmpegInstance.terminate === "function") ffmpegInstance.terminate();
      }
    } catch (e) { }
  }
}

function initModalElements() {
  if (!exportModal) {
    exportModal = document.getElementById("exportModal");
    exportStatus = document.getElementById("exportStatus");
    exportProgressBar = document.getElementById("exportProgressBar");
    exportDetails = document.getElementById("exportDetails");
    closeExportModalBtn = document.getElementById("closeExportModal");
  }
}

function showExportModal() {
  initModalElements();
  if (!exportModal) return;
  try {
    const z = getComputedStyle(document.documentElement).getPropertyValue("--z-modal").trim() || 2000;
    exportModal.style.cssText = `display: flex; z-index: ${z}; pointer-events: auto;`;
    exportModal.offsetWidth;
    exportModal.classList.add("visible");
    exportModal.setAttribute("aria-hidden", "false");
    const mc = exportModal.querySelector(".modalContent");
    if (mc) {
      mc.style.transform = "translateY(0) scale(1)";
      mc.style.opacity = "1";
    }
  } catch (e) { }
}

function hideExportModal() {
  if (!exportModal) return;
  try {
    exportModal.classList.remove("visible");
    const mc = exportModal.querySelector(".modalContent");
    if (mc) {
      mc.style.transform = `translateY(${getComputedStyle(document.documentElement).getPropertyValue("--anim-offset-y").trim() || "6px"}) scale(${getComputedStyle(document.documentElement).getPropertyValue("--anim-scale").trim() || "0.98"})`;
      mc.style.opacity = "0";
    }
  } catch (e) { }
  setTimeout(() => {
    try {
      exportModal.style.display = "none";
      exportModal.setAttribute("aria-hidden", "true");
    } catch (e) { }
  }, 300);
}

function updateExportProgress(progress, status, details = "") {
  initModalElements();
  if (exportProgressBar) exportProgressBar.style.width = `${progress}%`;
  if (exportStatus) exportStatus.textContent = status;
  if (exportDetails) exportDetails.textContent = details;
}

// Ensure the progress manager uses this DOM updater
progressManager.setUpdater(updateExportProgress);

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;

  const ffmpeg = new FFmpeg();

  ffmpeg.on("log", ({ message }) => console.log("[FFmpeg]", message));

  ffmpeg.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1) {
      try {
        progressManager.updateStageProgress("encoding", progress, `${Math.round(progress * 100)}%`, "Encoding...");
      } catch (e) { }
    }
  });

  try {
    // 0. Safety Check: specific to MT
    if (!("SharedArrayBuffer" in window)) {
      throw new Error("SharedArrayBuffer is not available. Please check your server headers (COOP/COEP) and browser compatibility.");
    }

    // 1. Set the correct baseURL for Vite/MT
    // Ensure you are pointing to core-mt
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";

    const remoteWasmURL = `${baseURL}/ffmpeg-core.wasm`;
    const remoteWorkerURL = `${baseURL}/ffmpeg-core.worker.js`; // Define worker URL
    const wasmKey = "ffmpeg_wasm_mt_" + encodeURIComponent(remoteWasmURL);

    // 2. Load WASM (Delegate to your existing cache/progress loader)
    const { wasmLoadURL, isBlob: isWasmBlob } = await fetchWasm(remoteWasmURL, wasmKey, progressManager, exportAbort);

    // 3. Load Worker (MUST be a Blob to work with SharedArrayBuffer from CDN)
    // We fetch this simply because it's small, so we don't strictly need the progress manager here,
    // but we MUST convert it to a blob.
    const workerBlob = await fetch(remoteWorkerURL).then(r => r.blob());
    const workerLoadURL = URL.createObjectURL(workerBlob);

    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: wasmLoadURL,
      workerURL: workerLoadURL, // Pass the Blob URL, not the CDN string
    });

    // 4. Cleanup Blobs
    // It's safe to revoke these after load() is complete
    if (isWasmBlob && wasmLoadURL && wasmLoadURL.startsWith("blob:")) {
      try { URL.revokeObjectURL(wasmLoadURL); } catch (e) { }
    }
    if (workerLoadURL) {
      try { URL.revokeObjectURL(workerLoadURL); } catch (e) { }
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;

  } catch (error) {
    // This catches the specific "SharedArrayBuffer" error or load failures
    throw new Error(`Failed to load FFmpeg MT: ${error.message}`);
  }
}

async function captureMapFrame() {
  const mapContainer = S.map.getContainer();
  if (!mapContainer) throw new Error("Map container not found");

  const width = mapContainer.offsetWidth;
  const height = mapContainer.offsetHeight;

  // Try fast direct composition from existing canvases/images inside the map container.
  try {
    const containerRect = mapContainer.getBoundingClientRect();

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext("2d");

    let drewSomething = false;

    // Draw elements in DOM order to preserve stacking (tiles, overlays, controls)
    const nodes = Array.from(mapContainer.querySelectorAll("canvas, img, svg"));
    for (const node of nodes) {
      // skip leaflet controls
      if (node.classList && node.classList.contains("leaflet-control")) continue;
      if (node.closest && node.closest(".leaflet-control-container")) continue;
      try {
        const r = node.getBoundingClientRect();
        const dx = Math.round(r.left - containerRect.left);
        const dy = Math.round(r.top - containerRect.top);
        const dw = Math.round(r.width);
        const dh = Math.round(r.height);
        if (node.tagName && node.tagName.toLowerCase() === "canvas") {
          const c = node;
          const sw = c.width || r.width;
          const sh = c.height || r.height;
          ctx.drawImage(c, 0, 0, sw, sh, dx, dy, dw, dh);
          drewSomething = true;
        } else if (node.tagName && node.tagName.toLowerCase() === "img") {
          ctx.drawImage(node, dx, dy, dw, dh);
          drewSomething = true;
        } else if (node.tagName && node.tagName.toLowerCase() === "svg") {
          const svg = node;
          const svgString = new XMLSerializer().serializeToString(svg);
          const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
          const bitmap = await createImageBitmap(blob);
          ctx.drawImage(bitmap, dx, dy, dw, dh);
          try { bitmap.close && bitmap.close(); } catch (e) { }
          drewSomething = true;
        }
      } catch (e) {
        console.warn("Skipped node during compose:", e);
      }
    }

    // If nothing drawable found, fallback to html2canvas
    if (!drewSomething) throw new Error("NO_DIRECT_LAYERS");

    // Quick taint check: reading pixels will throw if cross-origin tiles taint the canvas
    try {
      ctx.getImageData(0, 0, 1, 1);
    } catch (e) {
      throw new Error("CORS_ERROR");
    }

    return outCanvas;
  } catch (e) { }
}

function disableMapInteractions() {
  try {
    S.map.dragging.disable();
    S.map.touchZoom.disable();
    S.map.doubleClickZoom.disable();
    S.map.scrollWheelZoom.disable();
    S.map.boxZoom.disable();
    S.map.keyboard.disable();
    if (S.map.tap) S.map.tap.disable();
  } catch (e) { }
}

function enableMapInteractions() {
  try {
    S.map.dragging.enable();
    S.map.touchZoom.enable();
    S.map.doubleClickZoom.enable();
    S.map.scrollWheelZoom.enable();
    S.map.boxZoom.enable();
    S.map.keyboard.enable();
    if (S.map.tap) S.map.tap.enable();
  } catch (e) { }
}

export async function exportAnimationAsGif() {
  if (!S.currentMST || S.currentMST.length === 0) {
    alert("No MST to export. Please load a dataset first.");
    return;
  }

  showExportModal();
  progressManager.setStage("prepare", "Preparing...");

  exportAbort = { aborted: false };
  S.exportingGif = true;

  const cleanup = () => {
    S.exportingGif = false;
    enableMapInteractions();
    document.body.classList.remove("exporting-gif");
    stopFFmpeg();
    exportAbort = null;
    currentCleanup = null;
  };
  currentCleanup = cleanup;

  const earlyAbortReturn = () => {
    if (exportAbort?.aborted || !S.exportingGif) {
      try { cleanup(); } catch (e) { }
      try { hideExportModal(); } catch (e) { }
      return true;
    }
    return false;
  };

  try {
    disableMapInteractions();
    document.body.classList.add("exporting-gif");
    await new Promise((r) => setTimeout(r, 100));

    const cfg = S.CFG.GIF_EXPORT || {};

    progressManager.setStage("loading", "Loading FFmpeg...");
    const ffmpeg = await getFFmpeg();

    if (earlyAbortReturn()) return;

    progressManager.setStage("capturing", "Capturing frames...");

    const firstFrame = await captureMapFrame();
    if (earlyAbortReturn()) return;

    Anim.stopAnimation();
    Render.clearMSTLayers();
    S.animIndex = 0;
    Anim.clearCurrentEdgeAnim();

    if (earlyAbortReturn()) return;

    Anim.startAnimation();

    const start = performance.now();

    // Helper: convert canvas to PNG Blob and try to free the canvas backing store
    const canvasToBlob = (canvas) =>
      new Promise((resolve) => {
        canvas.toBlob((blob) => {
          try {
            canvas.width = 0;
            canvas.height = 0;
          } catch (e) { }
          resolve(blob);
        }, "image/png");
      });

    // Capture all frames as compressed Blobs (less memory than keeping raw canvases)
    const frameBlobs = [];

    // Predict captured/dropped using mathematical estimate (before capture)
    const originalFrameInterval = 1000 / cfg.CAPTURE_FPS;
    const origInitialCount = Math.round(cfg.INITIAL_FRAME_DELAY_MS / originalFrameInterval);
    const perEdgeMs = S.animationDelay * S.CFG.EDGE_GROWTH_DURATION_FACTOR;
    const origMiddleCount = Math.ceil((S.currentMST.length * perEdgeMs) / originalFrameInterval);
    const origFinalCount = Math.round(cfg.FINAL_FRAME_DELAY_MS / originalFrameInterval);
    const predictedCaptured = origInitialCount + origMiddleCount + origFinalCount;
    const predictedDropped = Math.max(0, predictedCaptured - cfg.MAX_CAPTURE_FRAMES);

    // Target: keep 10% more than predicted captured minus dropped (cushion)
    let targetCaptured = predictedCaptured - predictedDropped;
    targetCaptured += Math.round(targetCaptured * 0.1);
    const expectedDrop = Math.max(0, targetCaptured - cfg.MAX_CAPTURE_FRAMES);

    // Adjust capture FPS proportionally to reach targetCaptured
    const adjustedFPS = Math.max(MIN_FPS, cfg.CAPTURE_FPS * (targetCaptured / predictedCaptured));

    const captureIntervalMs = Math.round(1000 / adjustedFPS);

    console.log("[GIF export] predictedCaptured=", predictedCaptured,
      "predictedDropped=", predictedDropped,
      "targetCaptured=", targetCaptured,
      "expectedDrop=", expectedDrop,
      "originalFPS=", cfg.CAPTURE_FPS,
      "adjustedFPS=", Number(adjustedFPS.toFixed(2)));

    // push first frame(s) according to adjusted capture interval
    const initialCount = Math.max(1, Math.round(cfg.INITIAL_FRAME_DELAY_MS / captureIntervalMs));
    const firstBlob = await canvasToBlob(firstFrame);
    for (let i = 0; i < initialCount; i++) frameBlobs.push(firstBlob);

    // Update initial progress
    try { progressManager.updateStageProgress("capturing", Math.min(1, frameBlobs.length / targetCaptured), `${frameBlobs.length}/${targetCaptured}`, "Capturing frames"); } catch (e) { }

    // Safety hard cap to avoid runaway capture; set conservatively high but finite
    const HARD_LIMIT = Math.max(cfg.MAX_CAPTURE_FRAMES * 10, 2000);

    while (S.animateRafId && frameBlobs.length < HARD_LIMIT) {
      if (exportAbort?.aborted) break;
      await new Promise((r) => setTimeout(r, captureIntervalMs));
      try {
        const c = await captureMapFrame();
        frameBlobs.push(await canvasToBlob(c));
        progressManager.updateStageProgress("capturing", Math.min(1, frameBlobs.length / targetCaptured), `${frameBlobs.length}/${targetCaptured}`, "Capturing frames");
        await new Promise((r) => setTimeout(r, 0));
      } catch (e) {
        if (e.message === "CORS_ERROR") throw e;
      }
    }

    const duration = Math.max(0, performance.now() - start);
    if (!frameBlobs.length) frameBlobs.push(await canvasToBlob(await captureMapFrame()));

    // add final frame(s) according to FINAL_FRAME_DELAY_MS to create hold at the end
    const finalCanvas = await captureMapFrame();
    const finalBlob = await canvasToBlob(finalCanvas);
    const finalDelayMs = cfg.FINAL_FRAME_DELAY_MS;
    const finalCount = Math.max(1, Math.round(finalDelayMs / captureIntervalMs));
    for (let i = 0; i < finalCount; i++) frameBlobs.push(finalBlob);

    await checkAbortAndThrow();

    progressManager.setStage("writing", "Preparing frames...");

    // If we captured more than allowed by config, uniformly sample down to MAX_CAPTURE_FRAMES
    let sampledBlobs = frameBlobs;
    if (cfg.MAX_CAPTURE_FRAMES && frameBlobs.length > cfg.MAX_CAPTURE_FRAMES) {
      const N = frameBlobs.length;
      const M = cfg.MAX_CAPTURE_FRAMES;
      const step = N / M;
      sampledBlobs = new Array(M);
      for (let i = 0; i < M; i++) {
        const idx = Math.floor(i * step);
        sampledBlobs[i] = frameBlobs[idx];
      }
    }

    const frames = sampledBlobs.map((blob, i) => ({ blob, index: i }));

    // Log actual capture/sample results
    const actualCaptured = frameBlobs.length;
    const actualSampled = frames.length;
    const actualDropped = Math.max(0, actualCaptured - (cfg.MAX_CAPTURE_FRAMES || actualCaptured));
    console.log("[GIF export] actualCaptured=", actualCaptured,
      "actualSampled=", actualSampled,
      "actualDropped=", actualDropped);

    progressManager.setStage("writing", "Writing frames to FFmpeg...");

    for (let i = 0; i < frames.length; i++) {
      const frameData = new Uint8Array(await frames[i].blob.arrayBuffer());
      await ffmpeg.writeFile(`frame${String(i).padStart(5, "0")}.png`, frameData);

      await checkAbortAndThrow();

      if (i % 1 === 0) {
        progressManager.updateStageProgress("writing", (i + 1) / frames.length, `${i + 1}/${frames.length}`, "Writing frames...");
      }
    }

    await checkAbortAndThrow();

    // Calculate effective framerate based on the measured capture duration
    // Use real elapsed time (including final hold) so GIF duration matches animation
    const sampledCount = frames.length || 1;
    let ffmpegFramerate = cfg.CAPTURE_FPS;
    try {
      const totalDurationMs = Math.max(1, duration + (finalDelayMs || 0));
      // frames per second = number of frames / total seconds
      ffmpegFramerate = sampledCount / (totalDurationMs / 1000);
    } catch (e) { }
    ffmpegFramerate = Math.max(MIN_FPS, ffmpegFramerate);
    ffmpegFramerate = Number(ffmpegFramerate.toFixed(2));

    // Read max colors directly from settings (MAX_COLORS) or fallback to constant
    const maxColors = Number(cfg.MAX_COLORS || FFMPEG_MAX_COLORS);

    // Optional resolution downscale: target longest side (RESOLUTION)
    // scale only when max(iw,ih) > RES, preserve aspect: compute rounded scaled w/h
    // Note: the scale expression contains commas inside `if()` calls which
    // must NOT be treated as filter separators. Escape commas only inside
    // the scale expression so the rest of the filtergraph separators remain.
    const scaleFilter = `scale=if(gt(max(iw,ih),${cfg.RESOLUTION}),round(iw*${cfg.RESOLUTION}/max(iw,ih)),-2):if(gt(max(iw,ih),${cfg.RESOLUTION}),round(ih*${cfg.RESOLUTION}/max(iw,ih)),-2)`;

    // Escape commas within the scale expression to avoid splitting the filter
    // graph at those commas. Do NOT escape the commas that separate filters.
    const scaleFilterEscaped = scaleFilter.replace(/,/g, "\\,");

    const vfFilter = scaleFilter
      ? `${scaleFilterEscaped},split[s0][s1];[s0]palettegen=max_colors=${maxColors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${FFMPEG_BAYER_SCALE}`
      : `split[s0][s1];[s0]palettegen=max_colors=${maxColors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${FFMPEG_BAYER_SCALE}`;

    progressManager.setStage("encoding", `Encoding GIF...`, `Encoding at ${ffmpegFramerate} fps`);

    await checkAbortAndThrow();

    await ffmpeg.exec([
      '-threads', '4',
      "-framerate", String(ffmpegFramerate),
      "-i", "frame%05d.png",
      "-vf", vfFilter,
      "-loop", "0",
      "output.gif"
    ]);

    await checkAbortAndThrow();

    progressManager.setStage("reading", "Reading output...");

    const data = await ffmpeg.readFile("output.gif");
    const gifBlob = new Blob([data.buffer], { type: "image/gif" });

    progressManager.absolute(100, "Done!", "Downloading...");

    const url = URL.createObjectURL(gifBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mst-anim-${Date.now()}.gif`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    try {
      for (let i = 0; i < frames.length; i++) {
        await ffmpeg.deleteFile(`frame${String(i).padStart(5, "0")}.png`);
      }
      await ffmpeg.deleteFile("output.gif");
    } catch (e) {
      console.warn("FFmpeg cleanup error:", e);
    }

    cleanup();
    setTimeout(hideExportModal, 1500);

  } catch (e) {
    const wasAborted = exportAbort?.aborted || !S.exportingGif;
    cleanup();
    hideExportModal();
    if (e.message === "ABORTED" || wasAborted) return;
    alert(
      e.message === "CORS_ERROR"
        ? "CORS error on map tiles. Try switching to light theme or check network tab."
        : `Export failed: ${e.message}`
    );
  }
}

export function initExportModal() {
  initModalElements();
  if (closeExportModalBtn)
    closeExportModalBtn.addEventListener("click", () => {
      if (exportAbort) {
        try {
          resetAnimationState();
        } catch (e) { }
        exportAbort.aborted = true;
        try {
          currentCleanup && currentCleanup();
        } catch (e) { }
        hideExportModal();
      } else hideExportModal();
    });
}