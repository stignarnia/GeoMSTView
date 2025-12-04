import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";
import { resetAnimationState, readCachedBinary, writeCachedBinary } from "./utils.js";
import { progressManager } from "./progress-manager.js";
import { fetchWasm } from "./wasm-loader.js";
import { FFmpeg } from "@ffmpeg/ffmpeg";

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
      if (typeof ffmpegInstance.exit === "function") ffmpegInstance.exit();
      else if (typeof ffmpegInstance.terminate === "function") ffmpegInstance.terminate();
      ffmpegInstance = null;
    }
  } catch (e) { }
}

async function checkAbortAndThrow() {
  if (exportAbort?.aborted) {
    if (ffmpegInstance) stopFFmpeg();
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

progressManager.setUpdater(updateExportProgress);

async function getFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  const ffmpeg = new FFmpeg();
  ffmpeg.on("log", ({ message }) => console.log("[FFmpeg]", message));
  ffmpeg.on("progress", ({ progress }) => {
    if (progress > 0 && progress <= 1) progressManager.updateStageProgress("encoding", progress, `${Math.round(progress * 100)}%`, "Encoding...");
  });

  try {
    if (!("SharedArrayBuffer" in window)) throw new Error("SharedArrayBuffer missing.");
    const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/esm";
    const { wasmLoadURL, isBlob } = await fetchWasm(`${baseURL}/ffmpeg-core.wasm`, "ffmpeg_wasm_mt", progressManager, exportAbort);
    const workerBlob = await fetch(`${baseURL}/ffmpeg-core.worker.js`).then(r => r.blob());
    const workerLoadURL = URL.createObjectURL(workerBlob);

    await ffmpeg.load({
      coreURL: `${baseURL}/ffmpeg-core.js`,
      wasmURL: wasmLoadURL,
      workerURL: workerLoadURL,
    });
    if (isBlob) URL.revokeObjectURL(wasmLoadURL);
    URL.revokeObjectURL(workerLoadURL);
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  } catch (error) { throw new Error(`FFmpeg Load Failed: ${error.message}`); }
}

async function captureMapFrame(filterOpts = {}) {
  const mapContainer = S.map.getContainer();
  if (!mapContainer) throw new Error("Map container not found");

  const width = mapContainer.offsetWidth;
  const height = mapContainer.offsetHeight;
  const containerRect = mapContainer.getBoundingClientRect();

  const outCanvas = document.createElement("canvas");
  outCanvas.width = width; outCanvas.height = height;
  const ctx = outCanvas.getContext("2d");

  let drewSomething = false;
  const nodes = Array.from(mapContainer.querySelectorAll("canvas, img, svg"));

  for (const node of nodes) {
    if (node.classList?.contains("leaflet-control") || node.closest?.(".leaflet-control-container")) continue;

    // Filtering Logic
    if (filterOpts.only && !filterOpts.only.includes(node)) continue;
    if (filterOpts.exclude && filterOpts.exclude.includes(node)) continue;

    try {
      const r = node.getBoundingClientRect();
      const dx = Math.round(r.left - containerRect.left);
      const dy = Math.round(r.top - containerRect.top);
      const dw = Math.round(r.width);
      const dh = Math.round(r.height);

      if (dx + dw < 0 || dy + dh < 0 || dx > width || dy > height) continue;

      if (node.tagName === "CANVAS") {
        if (node.width > 0 && node.height > 0) {
          ctx.drawImage(node, 0, 0, node.width, node.height, dx, dy, dw, dh);
          drewSomething = true;
        }
      } else if (node.tagName === "IMG") {
        if (node.complete && node.naturalHeight > 0) {
          ctx.drawImage(node, dx, dy, dw, dh);
          drewSomething = true;
        }
      } else if (node.tagName === "SVG") {
        const svgString = new XMLSerializer().serializeToString(node);
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const bitmap = await createImageBitmap(blob);
        ctx.drawImage(bitmap, dx, dy, dw, dh);
        bitmap.close();
        drewSomething = true;
      }
    } catch (e) { }
  }

  // If we filtered for animation but nothing was drawn (empty frame), return transparent canvas
  if (!drewSomething && !filterOpts.only) throw new Error("NO_DIRECT_LAYERS");
  return outCanvas;
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

  try {
    disableMapInteractions();
    document.body.classList.add("exporting-gif");
    await new Promise(r => setTimeout(r, 100));

    const cfg = S.CFG.GIF_EXPORT || {};
    progressManager.setStage("loading", "Loading FFmpeg...");
    const ffmpeg = await getFFmpeg();
    if (exportAbort?.aborted) return cleanup();

    // 1. Identify Layers (Split Capture)
    const dynamicCanvasNode = S.mstCanvasRenderer ? S.mstCanvasRenderer._container : null;
    const useSeparation = !!dynamicCanvasNode && dynamicCanvasNode.tagName === 'CANVAS';

    const canvasToBlob = (canvas) => new Promise(r => canvas.toBlob(r, "image/png"));

    // 2. Capture Background (Static) ONCE
    progressManager.setStage("capturing", "Capturing background...");
    const bgOpts = useSeparation ? { exclude: [dynamicCanvasNode] } : {};
    const bgCanvas = await captureMapFrame(bgOpts);
    // Keep BG as Bitmap for fast compositing later
    const bgBitmap = await createImageBitmap(bgCanvas);

    // 3. Capture Loop (Animation Only - Transparent)
    Anim.stopAnimation();
    Render.clearMSTLayers();
    S.animIndex = 0; S.currentFloatIndex = 0; Anim.clearCurrentEdgeAnim();
    Anim.startAnimation();

    const start = performance.now();
    const frameBlobs = [];
    const animOpts = useSeparation ? { only: [dynamicCanvasNode] } : {};

    // Calc Timing for targetCaptured
    const originalFrameInterval = 1000 / cfg.CAPTURE_FPS;
    const perEdgeMs = S.animationDelay * S.CFG.EDGE_GROWTH_DURATION_FACTOR + S.animationDelay;
    const totalMstDuration = S.currentMST.length * perEdgeMs;
    const origInitialCount = Math.round(cfg.INITIAL_FRAME_DELAY_MS / originalFrameInterval);
    const origMiddleCount = Math.ceil(totalMstDuration / originalFrameInterval);
    const origFinalCount = Math.round(cfg.FINAL_FRAME_DELAY_MS / originalFrameInterval);
    const predictedCaptured = origInitialCount + origMiddleCount + origFinalCount;
    const predictedDropped = Math.max(0, predictedCaptured - cfg.MAX_CAPTURE_FRAMES);

    let targetCaptured = predictedCaptured - predictedDropped;
    targetCaptured += Math.round(targetCaptured * 0.1);
    const expectedDrop = Math.max(0, targetCaptured - cfg.MAX_CAPTURE_FRAMES);

    const adjustedFPS = Math.max(MIN_FPS, cfg.CAPTURE_FPS * (targetCaptured / predictedCaptured));
    const frameInterval = Math.round(1000 / adjustedFPS);

    console.log("[GIF export] predictedCaptured=", predictedCaptured,
      "predictedDropped=", predictedDropped,
      "targetCaptured=", targetCaptured,
      "expectedDrop=", expectedDrop,
      "originalFPS=", cfg.CAPTURE_FPS,
      "adjustedFPS=", Number(adjustedFPS.toFixed(2)));

    const initialCount = Math.max(1, Math.round(cfg.INITIAL_FRAME_DELAY_MS / frameInterval));
    const firstBlob = await canvasToBlob(await captureMapFrame(animOpts));
    for (let i = 0; i < initialCount; i++) frameBlobs.push(firstBlob);

    // Update progress with correct text
    try { progressManager.updateStageProgress("capturing", Math.min(1, frameBlobs.length / targetCaptured), `${frameBlobs.length}/${targetCaptured}`, "Capturing frames"); } catch (e) { }

    const HARD_LIMIT = Math.max(cfg.MAX_CAPTURE_FRAMES * 10, 2000);
    let nextTime = performance.now() + frameInterval;

    // Metrics variables
    let frameCount = 0, totalSync = 0, totalAsync = 0;

    while (S.animateRafId && frameBlobs.length < HARD_LIMIT) {
      if (exportAbort?.aborted) break;

      // --- METRICS START ---
      const t0 = performance.now();
      const c = await captureMapFrame(animOpts); // Blocking (Sync)
      const t1 = performance.now();
      const b = await canvasToBlob(c); // Yielding (Async)
      const t2 = performance.now();

      const sync = Math.round(t1 - t0);
      const async = Math.round(t2 - t1);
      totalSync += sync; totalAsync += async; frameCount++;

      console.log(`Frame ${frameCount} | BLOCKING (Canvas): ${sync}ms | YIELDING (Blob): ${async}ms`);
      // --- METRICS END ---

      frameBlobs.push(b);
      // Update progress with correct text
      progressManager.updateStageProgress("capturing", Math.min(1, frameBlobs.length / targetCaptured), `${frameBlobs.length}/${targetCaptured}`, "Capturing frames");

      const now = performance.now();
      const delay = Math.max(0, nextTime - now);
      await new Promise(r => setTimeout(r, delay));
      nextTime += frameInterval;
    }

    const duration = performance.now() - start;

    console.warn("--- PROOF RESULTS (Compositing Test) ---");
    console.warn(`Total Wall Time: ${Math.round(duration)}ms`);
    console.warn(`Captured Frames: ${frameCount}`);
    console.warn(`Avg BLOCKING Time (Frozen): ${Math.round(totalSync / (frameCount || 1))}ms`);
    console.warn(`Avg YIELDING Time (Animation Runs): ${Math.round(totalAsync / (frameCount || 1))}ms`);
    console.warn(`Total Time per Frame: ${Math.round((totalSync + totalAsync) / (frameCount || 1))}ms`);

    // Final Frames
    const finalCanvas = await captureMapFrame(animOpts);
    const finalBlob = await canvasToBlob(finalCanvas);
    const finalDelayMs = cfg.FINAL_FRAME_DELAY_MS;
    const finalCount = Math.max(1, Math.round(finalDelayMs / frameInterval));
    for (let i = 0; i < finalCount; i++) frameBlobs.push(finalBlob);

    await checkAbortAndThrow();

    // 4. Compositing & Writing Loop (The Fix: Merge BG + Anim here)
    progressManager.setStage("writing", "Compositing frames...");

    const compCanvas = document.createElement("canvas");
    compCanvas.width = bgCanvas.width; compCanvas.height = bgCanvas.height;
    const compCtx = compCanvas.getContext("2d");

    // Sampling
    let writeFrames = frameBlobs;
    if (cfg.MAX_CAPTURE_FRAMES && frameBlobs.length > cfg.MAX_CAPTURE_FRAMES) {
      const step = frameBlobs.length / cfg.MAX_CAPTURE_FRAMES;
      writeFrames = Array.from({ length: cfg.MAX_CAPTURE_FRAMES }, (_, i) => frameBlobs[Math.floor(i * step)]);
    }

    // Capture FPS adjustment
    const fps = Math.max(MIN_FPS, Number(((writeFrames.length) / ((duration + finalDelayMs) / 1000)).toFixed(2)));

    for (let i = 0; i < writeFrames.length; i++) {
      // Draw BG + Anim Frame
      compCtx.drawImage(bgCanvas, 0, 0); // Use canvas source (fast)
      const frameBmp = await createImageBitmap(writeFrames[i]);
      compCtx.drawImage(frameBmp, 0, 0);
      frameBmp.close();

      // Convert to Blob -> Buffer -> Write
      const finalBlob = await new Promise(r => compCanvas.toBlob(r, "image/png"));
      const buf = new Uint8Array(await finalBlob.arrayBuffer());
      await ffmpeg.writeFile(`frame${String(i).padStart(5, "0")}.png`, buf);

      progressManager.updateStageProgress("writing", (i + 1) / writeFrames.length, `${i + 1}/${writeFrames.length}`, "Compositing & Writing...");
      await checkAbortAndThrow();
    }

    bgBitmap.close();

    // 5. Encode (Standard Single Pass)
    const maxColors = cfg.MAX_COLORS || FFMPEG_MAX_COLORS;
    const scale = `scale=if(gt(max(iw,ih),${cfg.RESOLUTION}),round(iw*${cfg.RESOLUTION}/max(iw,ih)),-2):if(gt(max(iw,ih),${cfg.RESOLUTION}),round(ih*${cfg.RESOLUTION}/max(iw,ih)),-2)`;
    const vf = `${scale.replace(/,/g, "\\,")},split[s0][s1];[s0]palettegen=max_colors=${maxColors}[p];[s1][p]paletteuse=dither=bayer:bayer_scale=${FFMPEG_BAYER_SCALE}`;

    progressManager.setStage("encoding", `Encoding GIF...`, `Encoding at ${fps} fps`);

    await checkAbortAndThrow();

    await ffmpeg.exec([
      '-threads', '4',
      '-framerate', String(fps),
      '-i', 'frame%05d.png',
      '-vf', vf,
      '-loop', '0',
      'output.gif'
    ]);

    await checkAbortAndThrow();

    // 6. Download
    const data = await ffmpeg.readFile("output.gif");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([data.buffer], { type: "image/gif" }));
    a.download = `mst-anim-${Date.now()}.gif`;
    a.click();

    // Cleanup
    try {
      await ffmpeg.deleteFile("output.gif");
      for (let i = 0; i < writeFrames.length; i++) await ffmpeg.deleteFile(`frame${String(i).padStart(5, "0")}.png`);
    } catch (e) { }

    cleanup();
    hideExportModal();

  } catch (e) {
    const wasAborted = exportAbort?.aborted || !S.exportingGif;
    cleanup();
    hideExportModal();
    if (wasAborted) return;
    alert(`Export failed: ${e.message}`);
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
