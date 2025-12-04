import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";
import { resetAnimationState, readCachedBinary, writeCachedBinary } from "./utils.js";
import { progressManager } from "./progress-manager.js";
import { fetchWasm } from "./wasm-loader.js";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { Output, WebMOutputFormat, BufferTarget, CanvasSource } from "mediabunny";

const FFMPEG_MAX_COLORS = 256;
const FFMPEG_BAYER_SCALE = 5;
const MIN_FPS = 1;

let exportModal, exportStatus, exportProgressBar, exportDetails, closeExportModalBtn;
let exportAbort = null;
let ffmpegInstance = null;
let currentCleanup = null;
let mediaOutput = null;
let videoSource = null;

async function stopFFmpeg() {
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

async function stopMediabunny() {
  // Mediabunny handles cleanup mostly via garbage collection, 
  // but we can ensure the Output doesn't process further.
  mediaOutput = null;
  videoSource = null;
}

async function checkAbortAndThrow() {
  if (exportAbort?.aborted) {
    await stopMediabunny();
    await stopFFmpeg();
    throw new Error("ABORTED");
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

function updateExportProgress(progress, status, details = "") {
  initModalElements();
  if (exportProgressBar) exportProgressBar.style.width = `${progress}%`;
  if (exportStatus) exportStatus.textContent = status;
  if (exportDetails) exportDetails.textContent = details;
}

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
    if (!("SharedArrayBuffer" in window)) {
      throw new Error("SharedArrayBuffer is not available. Please check your server headers (COOP/COEP) and browser compatibility.");
    }

    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";

    const remoteWasmURL = `${baseURL}/ffmpeg-core.wasm`;
    const remoteWorkerURL = `${baseURL}/ffmpeg-core.worker.js`;
    const wasmKey = "ffmpeg_wasm_mt_" + encodeURIComponent(remoteWasmURL);

    const { wasmLoadURL, isBlob: isWasmBlob } = await fetchWasm(remoteWasmURL, wasmKey, progressManager, exportAbort);

    const workerBlob = await fetch(remoteWorkerURL).then(r => r.blob());
    const workerLoadURL = URL.createObjectURL(workerBlob);

    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: wasmLoadURL,
      workerURL: workerLoadURL,
    });

    if (isWasmBlob && wasmLoadURL && wasmLoadURL.startsWith("blob:")) {
      try { URL.revokeObjectURL(wasmLoadURL); } catch (e) { }
    }
    if (workerLoadURL) {
      try { URL.revokeObjectURL(workerLoadURL); } catch (e) { }
    }

    ffmpegInstance = ffmpeg;
    return ffmpeg;

  } catch (error) {
    throw new Error(`Failed to load FFmpeg MT: ${error.message}`);
  }
}

async function captureMapFrame() {
  const mapContainer = S.map.getContainer();
  if (!mapContainer) throw new Error("Map container not found");

  const width = mapContainer.offsetWidth;
  const height = mapContainer.offsetHeight;

  try {
    const containerRect = mapContainer.getBoundingClientRect();

    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const ctx = outCanvas.getContext("2d");

    let drewSomething = false;

    const nodes = Array.from(mapContainer.querySelectorAll("canvas, img, svg"));
    for (const node of nodes) {
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

    if (!drewSomething) throw new Error("NO_DIRECT_LAYERS");

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
    stopMediabunny();
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

    // Determine dimensions from the map container
    const mapContainer = S.map.getContainer();
    const width = mapContainer.offsetWidth;
    const height = mapContainer.offsetHeight;

    // --- 1. SETUP MEDIABUNNY (WebCodecs + Muxer) ---
    progressManager.setStage("setup", "Setting up encoder...");

    // Create a staging canvas. CanvasSource needs a persistent DOM element to read from.
    // We will draw our captured frames onto this canvas.
    const stagingCanvas = document.createElement("canvas");
    stagingCanvas.width = width;
    stagingCanvas.height = height;
    const stagingCtx = stagingCanvas.getContext("2d", { willReadFrequently: false });

    // Initialize Output for WebM (using VP9 implies WebM/Matroska)
    mediaOutput = new Output({
      format: new WebMOutputFormat(),
      target: new BufferTarget(), // Stores the result in RAM
    });

    // Initialize CanvasSource (The WebCodecs Abstraction)
    // This wrapper handles the VideoEncoder internally.
    videoSource = new CanvasSource(stagingCanvas, {
      codec: 'vp9', // Use VP9 for better efficiency/quality over H.264
      bitrate: 3_000_000,
      // We let the source infer size from the canvas
    });

    // Add the source to the output
    mediaOutput.addVideoTrack(videoSource, {
      frameRate: cfg.CAPTURE_FPS || 30, // Metadata hint
    });

    // Must start the output before adding frames
    mediaOutput.start();

    if (earlyAbortReturn()) return;

    // --- 2. PRE-ANIMATION STATE ---
    Anim.stopAnimation();
    Render.clearMSTLayers();
    S.animIndex = 0;
    S.currentFloatIndex = 0;
    Anim.clearCurrentEdgeAnim();

    // Calculate timing
    const originalFrameInterval = 1000 / cfg.CAPTURE_FPS;
    const captureIntervalSec = originalFrameInterval / 1000;
    const perEdgeMs = S.animationDelay * S.CFG.EDGE_GROWTH_DURATION_FACTOR + S.animationDelay;
    const origMiddleCount = Math.ceil((S.currentMST.length * perEdgeMs) / originalFrameInterval);
    const predictedCaptured = Math.round(cfg.INITIAL_FRAME_DELAY_MS / originalFrameInterval) + origMiddleCount + Math.round(cfg.FINAL_FRAME_DELAY_MS / originalFrameInterval);

    const initialCount = Math.max(1, Math.round(cfg.INITIAL_FRAME_DELAY_MS / originalFrameInterval));
    let frameCount = 0;
    let totalPrep = 0, totalAdd = 0;

    // --- 3. THE CAPTURE LOOP ---
    progressManager.setStage("capturing", `Capturing frames at ${cfg.CAPTURE_FPS} FPS...`);

    // Helper to capture, draw to stage, and feed encoder
    const processFrame = async (timestampOffsetSec) => {
      const t0 = performance.now();

      // A. Capture (Compositing layers)
      const frameCanvas = await captureMapFrame();

      // B. Draw to Staging Canvas (Fast GPU Copy)
      // This updates the element that CanvasSource is watching
      stagingCtx.clearRect(0, 0, width, height);
      stagingCtx.drawImage(frameCanvas, 0, 0);

      // Clear temp canvas to free memory
      frameCanvas.width = 0; frameCanvas.height = 0;

      const t1 = performance.now();

      // C. Feed Mediabunny (Wraps VideoEncoder)
      // .add() snapshots the canvas immediately. The encoding happens asynchronously.
      await videoSource.add(timestampOffsetSec, captureIntervalSec);

      const t2 = performance.now();

      totalPrep += (t1 - t0);
      totalAdd += (t2 - t1);

      console.log(`Frame ${frameCount} | BLOCKING (Prep/Draw): ${Math.round(t1 - t0)}ms | YIELDING (Add/Encode): ${Math.round(t2 - t1)}ms`);
    };

    // Initial Static Frames
    const firstCanvas = await captureMapFrame();
    stagingCtx.drawImage(firstCanvas, 0, 0);
    for (let i = 0; i < initialCount; i++) {
      await videoSource.add(frameCount * captureIntervalSec, captureIntervalSec);
      frameCount++;
    }
    firstCanvas.width = 0; firstCanvas.height = 0;

    Anim.startAnimation();

    const start = performance.now();
    let nextCaptureTime = performance.now() + originalFrameInterval;

    while (S.animateRafId) {
      if (exportAbort?.aborted) break;

      try {
        await processFrame(frameCount * captureIntervalSec);

        frameCount++;
        progressManager.updateStageProgress("capturing", Math.min(1, frameCount / predictedCaptured), `${frameCount}/${predictedCaptured} total`, "Capturing frames...");

      } catch (e) {
        if (e.message === "CORS_ERROR" || e.message === "ABORTED") throw e;
        console.warn("Frame capture error:", e);
      }

      // Timing Logic
      const now = performance.now();
      const delay = Math.max(0, nextCaptureTime - now);

      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      else await new Promise((r) => setTimeout(r, 0));

      nextCaptureTime += originalFrameInterval;
      if (nextCaptureTime < performance.now() - 1000) {
        nextCaptureTime = performance.now() + originalFrameInterval;
      }
    }

    const duration = Math.max(0, performance.now() - start);

    // Final Static Frames
    const finalCanvas = await captureMapFrame();
    stagingCtx.drawImage(finalCanvas, 0, 0);
    const finalDelayMs = cfg.FINAL_FRAME_DELAY_MS;
    const finalCount = Math.max(1, Math.round(finalDelayMs / originalFrameInterval));
    for (let i = 0; i < finalCount; i++) {
      await videoSource.add(frameCount * captureIntervalSec, captureIntervalSec);
      frameCount++;
    }
    finalCanvas.width = 0; finalCanvas.height = 0;

    await checkAbortAndThrow();

    // --- 4. FINALIZE ---
    progressManager.setStage("writing", "Finalizing video file...");

    const actualFrames = frameCount - initialCount - finalCount;
    console.log("--- MEDIABUNNY RESULTS ---");
    console.log(`Total Wall Time: ${Math.round(duration)}ms`);
    console.log(`Captured Frames: ${actualFrames}`);
    console.log(`Avg BLOCKING (Draw): ${Math.round(totalPrep / (actualFrames || 1))}ms`);
    console.log(`Avg YIELDING (Encode): ${Math.round(totalAdd / (actualFrames || 1))}ms`);

    // Finalize the output to flush encoders and write the file
    await mediaOutput.finalize();
    const videoBuffer = new Uint8Array(mediaOutput.target.buffer);

    // Write to FFmpeg
    const INPUT_FILENAME = "input.webm";
    await ffmpeg.writeFile(INPUT_FILENAME, videoBuffer);

    await checkAbortAndThrow();

    // --- 5. ENCODE GIF FROM VIDEO INPUT ---
    const maxColors = Number(cfg.MAX_COLORS || FFMPEG_MAX_COLORS);

    // FFmpeg settings
    const scaleFilter = `scale=if(gt(max(iw,ih),${cfg.RESOLUTION}),round(iw*${cfg.RESOLUTION}/max(iw,ih)),-2):if(gt(max(iw,ih),${cfg.RESOLUTION}),round(ih*${cfg.RESOLUTION}/max(iw,ih)),-2)`;
    const scaleFilterEscaped = scaleFilter.replace(/,/g, "\\,");
    const vfFilter = `${scaleFilterEscaped},split[s0][s1];[s0]palettegen=max_colors=${maxColors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${FFMPEG_BAYER_SCALE}`;

    progressManager.setStage("encoding", `Encoding GIF...`, `Converting video to GIF`);

    await checkAbortAndThrow();

    const OUTPUT_FILENAME = "output.gif";

    await ffmpeg.exec([
      '-threads', '4',
      '-i', INPUT_FILENAME,
      '-vf', vfFilter,
      '-loop', '0',
      OUTPUT_FILENAME
    ]);

    await checkAbortAndThrow();

    // --- 6. DOWNLOAD ---
    progressManager.setStage("reading", "Reading output...");

    const data = await ffmpeg.readFile(OUTPUT_FILENAME);
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
      await ffmpeg.deleteFile(INPUT_FILENAME);
      await ffmpeg.deleteFile(OUTPUT_FILENAME);
    } catch (e) { }

    cleanup();
    setTimeout(hideExportModal, 1500);

  } catch (e) {
    const wasAborted = e.message === "ABORTED" || exportAbort?.aborted || !S.exportingGif;
    cleanup();
    hideExportModal();
    if (wasAborted) return;
    alert(
      e.message === "CORS_ERROR"
        ? "CORS error on map tiles. Try switching to light theme or check network tab."
        : `Export failed: ${e.message}`
    );
  }
}
