import { S } from "./state.js";
import { gcKey, greatCirclePoints } from "./shared.js";

export let currentEdgeAnim = null;

export function animateStep() {
  if (S.animIndex >= S.currentMST.length) {
    return;
  }
  const e = S.currentMST[S.animIndex];
  const key = gcKey
    ? gcKey(e.u, e.v)
    : Math.min(e.u, e.v) + "|" + Math.max(e.u, e.v);
  let latlngs = S.gcCacheGlobal.get(key);
  if (!latlngs) {
    latlngs = (
      greatCirclePoints ||
      function (a, b) {
        return [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ];
      }
    )(S.currentCities[e.u], S.currentCities[e.v], {
      GC_MIN_SEGMENTS: S.CFG.GC_MIN_SEGMENTS,
      GC_MAX_SEGMENTS: S.CFG.GC_MAX_SEGMENTS,
      GC_SEGMENT_FACTOR: S.CFG.GC_SEGMENT_FACTOR,
      DISTANCE_RADIUS_KM: S.CFG.DISTANCE_RADIUS_KM,
    });
    S.gcCacheGlobal.set(key, latlngs);
  }

  const h1 = L.circleMarker(
    [S.currentCities[e.u].lat, S.currentCities[e.u].lon],
    {
      radius: S.CFG.HIGHLIGHT_RADIUS,
      color: S.CFG.HIGHLIGHT_COLOR,
      fillColor: S.CFG.HIGHLIGHT_COLOR,
      fillOpacity: 0,
      opacity: 0,
      className: "highlight-marker",
      pane: "highlightPane",
      renderer: S.mstCanvasRenderer,
    }
  ).addTo(S.map);
  const h2 = L.circleMarker(
    [S.currentCities[e.v].lat, S.currentCities[e.v].lon],
    {
      radius: S.CFG.HIGHLIGHT_RADIUS,
      color: S.CFG.HIGHLIGHT_COLOR,
      fillColor: S.CFG.HIGHLIGHT_FILL,
      fillOpacity: 0,
      opacity: 0,
      className: "highlight-marker",
      pane: "highlightPane",
      renderer: S.mstCanvasRenderer,
    }
  ).addTo(S.map);
  S.highlightMarkers.push(h1, h2);

  // Gradually fade in highlight for canvas-rendered markers
  (function animateHighlight(a, b) {
    const delay = Number(S.CFG.HIGHLIGHT_FADE_IN_DELAY_MS) || 0;
    const duration = Number(S.CFG.HIGHLIGHT_ANIM_DURATION) || 300;
    const targetFill = 1;
    const targetOp = 1;
    const start = performance.now() + delay;
    function step() {
      const now = performance.now();
      const t = Math.max(0, Math.min(1, (now - start) / duration));
      const fill = targetFill * t;
      const op = targetOp * t;
      try {
        a.setStyle({ fillOpacity: fill, opacity: op });
        b.setStyle({ fillOpacity: fill, opacity: op });
      } catch (e) { }
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  })(h1, h2);

  currentEdgeAnim = {
    latlngs: latlngs,
    progress: 0,
    polylineParts: [],
    // Note: We no longer rely on startTime for logic, but it's harmless to keep
    startTime: performance.now(),
  };
  S.animIndex++;
}

/**
 * Visual update only - driven by the computed progress (0..1) passed in.
 * We removed the time calculation from here to centralize it in the loop.
 */
export function updateEdgeAnimationVisuals(progress) {
  if (!currentEdgeAnim) return;

  currentEdgeAnim.progress = progress;

  // Reuse existing polyline parts when possible
  const totalPoints = currentEdgeAnim.latlngs.length;
  const pointsToShow = Math.max(
    2,
    Math.floor(totalPoints * currentEdgeAnim.progress)
  );
  const partialLatlngs = currentEdgeAnim.latlngs.slice(0, pointsToShow);

  const newParts = [];
  if (partialLatlngs && partialLatlngs.length) {
    let seg = [partialLatlngs[0]];
    let partIndex = 0;
    const addOrUpdatePart = (latlngSegment) => {
      const polyOpts = Object.assign({}, S.CFG.MST_STYLE);
      try {
        polyOpts.renderer = S.mstCanvasRenderer;
        polyOpts.pane = "mstPane";
      } catch (e) { }
      const parent = S.mstLayerGroup || S.map;
      const existing =
        currentEdgeAnim.polylineParts &&
        currentEdgeAnim.polylineParts[partIndex];
      if (existing && typeof existing.setLatLngs === "function") {
        try {
          existing.setLatLngs(latlngSegment);
        } catch (e) { }
        newParts.push(existing);
      } else {
        try {
          const p = L.polyline(latlngSegment, polyOpts).addTo(parent);
          newParts.push(p);
          if (Array.isArray(S.mstLines)) S.mstLines.push(p);
        } catch (e) { }
      }
      partIndex++;
    };

    for (let i = 1; i < partialLatlngs.length; i++) {
      const prevLon = partialLatlngs[i - 1][1];
      const curLon = partialLatlngs[i][1];
      const rawDiff = curLon - prevLon;
      if (Math.abs(rawDiff) > S.CFG.WRAP_LON_THRESHOLD) {
        addOrUpdatePart(seg);
        seg = [partialLatlngs[i]];
      } else {
        seg.push(partialLatlngs[i]);
      }
    }
    if (seg.length) addOrUpdatePart(seg);
  }

  // Remove leftover old parts
  if (currentEdgeAnim.polylineParts && currentEdgeAnim.polylineParts.length) {
    for (
      let i = newParts.length;
      i < currentEdgeAnim.polylineParts.length;
      i++
    ) {
      const old = currentEdgeAnim.polylineParts[i];
      try {
        if (old && old.remove) old.remove();
      } catch (e) { }
      try {
        const idx = S.mstLines.indexOf(old);
        if (idx >= 0) S.mstLines.splice(idx, 1);
      } catch (e) { }
    }
  }

  currentEdgeAnim.polylineParts = newParts;
}

export function stopAnimation() {
  if (S.animateRafId) {
    cancelAnimationFrame(S.animateRafId);
    S.animateRafId = null;
  }
  S.candidateRedrawAllowed = false;
}

export function clearCurrentEdgeAnim() {
  currentEdgeAnim = null;
}

export function startAnimation() {
  if (S.animateRafId) return;

  S.candidateRedrawAllowed = false;
  S.lastFrameTime = performance.now();

  // If we are restarting, pick up exactly where we left off (S.currentFloatIndex)
  // If this is a fresh start, ensure index is reset elsewhere or here:
  if (S.animIndex === 0) S.currentFloatIndex = 0;

  function loop(ts) {
    if (!S.animateRafId) return;

    const dt = ts - S.lastFrameTime;
    S.lastFrameTime = ts;

    // 1. Calculate current step properties
    const growthDuration = S.animationDelay * S.CFG.EDGE_GROWTH_DURATION_FACTOR;
    const pauseDuration = S.animationDelay; // Total step time = growth + pause? 
    const stepInterval = growthDuration + pauseDuration;

    // 2. Advance Float Index based on Delta Time
    // Rate of change = 1 step / stepInterval (ms)
    const stepProgress = dt / stepInterval;
    S.currentFloatIndex += stepProgress;

    // 3. Handle Logic based on Float Index
    const totalSteps = S.currentMST.length;
    const integerIndex = Math.floor(S.currentFloatIndex); // Which step are we fully IN?

    // If we are behind the integer index (e.g. we just crossed a threshold)
    // we need to ensure all previous steps are visually completed.
    while (S.animIndex < integerIndex && S.animIndex < totalSteps) {
      // Finish current edge
      if (currentEdgeAnim) {
        updateEdgeAnimationVisuals(1.0);
        currentEdgeAnim = null;
      }
      // Start next edge (creates currentEdgeAnim)
      animateStep();

      // If we are still behind after starting it, finish it immediately
      if (S.animIndex < integerIndex && currentEdgeAnim) {
        updateEdgeAnimationVisuals(1.0);
        currentEdgeAnim = null;
      }
    }

    // 4. Animate the current active edge
    // S.animIndex now points to the edge we are *currently* processing (or just finished).
    // The fractional part of S.currentFloatIndex tells us how far we are into THIS step.
    if (currentEdgeAnim) {
      // Calculate 0..1 progress within this specific step interval
      const stepFraction = S.currentFloatIndex - (S.animIndex - 1);

      // Map step fraction (0..1 over growth+pause) to growth phase (0..1 over growth only)
      const growthFraction = growthDuration / stepInterval;
      let visualProgress = stepFraction / growthFraction;

      // Clamp to 1 (if we are in the pause phase, we stay at 100% visual)
      visualProgress = Math.min(1, Math.max(0, visualProgress));

      updateEdgeAnimationVisuals(visualProgress);

      if (stepFraction >= 1.0) {
        // Step complete
        currentEdgeAnim = null;
      }
    } else if (S.animIndex < totalSteps && S.animIndex <= integerIndex) {
      // Case: We just finished a step but haven't started the new one yet, 
      // AND the float index says we should be in the new one.
      animateStep();
    }

    // 5. Check for completion
    if (S.animIndex >= totalSteps && !currentEdgeAnim) {
      stopAnimation();
      return;
    }

    S.animateRafId = requestAnimationFrame(loop);
  }

  S.animateRafId = requestAnimationFrame(loop);
}