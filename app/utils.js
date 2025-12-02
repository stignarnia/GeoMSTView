import {
  greatCirclePoints as sharedGreatCirclePoints,
  gcKey as sharedGcKey,
  dedent as sharedDedent,
  parseColor as sharedParseColor,
} from "./shared.js";
import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";

try {
  Anim.stopAnimation();
  Render.clearMSTLayers();
  S.animIndex = 0;
  Anim.clearCurrentEdgeAnim();
} catch (e) {}

export const computeCitiesKey = (list) => {
  if (!Array.isArray(list) || list.length === 0) return "";
  try {
    const arr = list.map((c) => {
      const lat = typeof c.lat === "number" ? c.lat.toFixed(6) : String(c.lat);
      const lon = typeof c.lon === "number" ? c.lon.toFixed(6) : String(c.lon);
      const name = String(c.name || "");
      const pop = c.population || "";
      return lat + "|" + lon + "|" + name + "|" + pop;
    });
    arr.sort();
    return arr.join(";");
  } catch (e) {
    return "";
  }
};

export const lerpColor = (color1, color2, t) => {
  const parseColorFn =
    sharedParseColor || ((c) => ({ r: 255, g: 255, b: 255 }));
  const c1 = parseColorFn(color1);
  const c2 = parseColorFn(color2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
};

export const dedent =
  sharedDedent || ((str) => String(str || "").replace(/\r\n/g, "\n"));

export const gcKey =
  sharedGcKey || ((a, b) => Math.min(a, b) + "|" + Math.max(a, b));

export const greatCirclePoints = sharedGreatCirclePoints;
