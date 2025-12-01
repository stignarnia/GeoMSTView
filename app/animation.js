import { S } from "./state.js";
import { gcKey, greatCirclePoints } from "./utils.js";
import { addWrappedPolyline } from "./render.js";

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
      fillColor: S.CFG.HIGHLIGHT_FILL,
      fillOpacity: 0,
      opacity: 0,
      className: "highlight-marker",
      pane: "highlightPane",
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
    }
  ).addTo(S.map);
  S.highlightMarkers.push(h1, h2);

  setTimeout(() => {
    try {
      h1.setStyle({ fillOpacity: S.CFG.HIGHLIGHT_FILL_OPACITY, opacity: 1 });
      h2.setStyle({ fillOpacity: S.CFG.HIGHLIGHT_FILL_OPACITY, opacity: 1 });
    } catch (e) {}
  }, S.CFG.HIGHLIGHT_FADE_IN_DELAY_MS);

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
  currentEdgeAnim.polylineParts.forEach((p) => {
    try {
      if (p && p.remove) p.remove();
    } catch (e) {}
  });
  currentEdgeAnim.polylineParts = [];
  const totalPoints = currentEdgeAnim.latlngs.length;
  const pointsToShow = Math.max(
    2,
    Math.floor(totalPoints * currentEdgeAnim.progress)
  );
  const partialLatlngs = currentEdgeAnim.latlngs.slice(0, pointsToShow);
  const parts = addWrappedPolyline(partialLatlngs, S.CFG.MST_STYLE, S.mstLines);
  currentEdgeAnim.polylineParts = parts;
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
}

export function startAnimation() {
  if (S.animateRafId) return;
  S.animateLastStepTs = performance.now();
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
      } catch (e) {}
      S.animateLastStepTs = ts;
    }
    S.animateRafId = requestAnimationFrame(loop);
  }
  S.animateRafId = requestAnimationFrame(loop);
}
