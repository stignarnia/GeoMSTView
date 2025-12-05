import { parseColor } from "./shared.js";
import { S } from "./state.js";
import * as Anim from "./animation.js";
import * as Render from "./render.js";

export const resetAnimationState = () => {
  Anim.stopAnimation();
  Render.clearMSTLayers();
  S.animIndex = 0;
  Anim.clearCurrentEdgeAnim();
  // re-enable candidate redraws after a central reset
  S.candidateRedrawAllowed = true;
};

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
  const c1 = parseColor(color1);
  const c2 = parseColor(color2);
  const r = Math.round(c1.r + (c2.r - c1.r) * t);
  const g = Math.round(c1.g + (c2.g - c1.g) * t);
  const b = Math.round(c1.b + (c2.b - c1.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
};

const DB_NAME = "IndexedDB";
const DB_VERSION = 1;
const STORE_NAME = "binary_store";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

async function getRawRecord(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => {
        console.warn("IDB Read Error");
        resolve(null);
      };
    });
  } catch (e) {
    console.error("Failed to read from cache DB", e);
    return null;
  }
}

async function putRawRecord(key, record) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(record, key);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => {
        console.error("IDB Write Error:", e);
        resolve(false);
      };
    });
  } catch (e) {
    console.error("Failed to write to cache DB", e);
    return false;
  }
}

async function removeRawRecord(key) {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const transaction = db.transaction([STORE_NAME], "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  } catch (e) {
    console.error("Failed to remove record from IDB", e);
    return false;
  }
}

export async function getRecord(key) {
  return await getRawRecord(key);
}

export async function putRecord(key, record) {
  return await putRawRecord(key, record);
}

export async function removeRecord(key) {
  return await removeRawRecord(key);
}

export async function readCachedBinary(key, maxAgeMs = Infinity) {
  try {
    const record = await getRawRecord(key);
    if (!record) return null;
    if (isFinite(maxAgeMs) && Date.now() - record.ts > maxAgeMs) return null;
    return record.data || null;
  } catch (e) {
    console.error("Failed to read binary from cache DB", e);
    return null;
  }
}

export async function writeCachedBinary(key, arrayBuffer) {
  try {
    return await putRawRecord(key, { ts: Date.now(), data: arrayBuffer });
  } catch (e) {
    console.error("Failed to write binary to cache DB", e);
    return false;
  }
}

// Settings persistence helpers (use localStorage, similar to theme usage)
export function getSetting(key) {
  try {
    const raw = localStorage.getItem(S.SETTINGS_PREFIX + key);
    if (raw === null || typeof raw === "undefined") return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      return raw;
    }
  } catch (e) {
    return null;
  }
}

export function setSetting(key, value) {
  try {
    const toStore = JSON.stringify(value);
    localStorage.setItem(S.SETTINGS_PREFIX + key, toStore);
    return true;
  } catch (e) {
    return false;
  }
}

export function loadAllSettings() {
  return {
    dataset: getSetting(S.SETTINGS_KEYS.DATASET),
    algorithm: getSetting(S.SETTINGS_KEYS.ALGORITHM),
    endpoint: getSetting(S.SETTINGS_KEYS.ENDPOINT),
    animationDelay: getSetting(S.SETTINGS_KEYS.ANIMATION_DELAY),
  };
}
