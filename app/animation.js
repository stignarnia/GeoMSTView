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

  // Gradually fade in highlight for canvas-rendered markers so GIF export captures it
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
    startTime: performance.now(),
  };
  S.animIndex++;
}

export function updateEdgeAnimation(timestamp) {
  if (!currentEdgeAnim) return true;
  const elapsed = timestamp - currentEdgeAnim.startTime;
  const duration = Math.max(
    100,
    S.animationDelay * S.CFG.EDGE_GROWTH_DURATION_FACTOR
  );
  currentEdgeAnim.progress = Math.min(1, elapsed / duration);
  // Reuse existing polyline parts when possible to avoid frequent create/remove
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

  // Remove any leftover old parts that weren't reused
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
  if (currentEdgeAnim.progress >= 1) {
    currentEdgeAnim = null;
    return true;
  }
  return false;
}

export function stopAnimation() {
  if (S.animateRafId) {
    cancelAnimationFrame(S.animateRafId);
    S.animateRafId = null;
  }
  // ensure candidate redraws stay disabled when animation stops/finishes
  S.candidateRedrawAllowed = false;
}

export function clearCurrentEdgeAnim() {
  currentEdgeAnim = null;
}

export function startAnimation() {
  if (S.animateRafId) return;
  S.animateLastStepTs = performance.now();
  // disable candidate redraws while animation is running (and after)
  S.candidateRedrawAllowed = false;
  function loop(ts) {
    if (!S.animateRafId) return;
    if (S.animIndex >= S.currentMST.length && !currentEdgeAnim) {
      stopAnimation();
      return;
    }
    if (currentEdgeAnim) {
      const edgeComplete = updateEdgeAnimation(ts);
      if (!edgeComplete) {
        S.animateRafId = requestAnimationFrame(loop);
        return;
      }
    }
    if (ts - S.animateLastStepTs >= S.animationDelay) {
      try {
        animateStep();
      } catch (e) { }
      S.animateLastStepTs = ts;
    }
    S.animateRafId = requestAnimationFrame(loop);
  }
  S.animateRafId = requestAnimationFrame(loop);
}
