import { S } from "./state.js";
import { showSpinner, hideSpinner } from "./ui.js";
import { renderCities } from "./render.js";

export async function fetchOverpass(query, cacheKey) {
  const endpoint = S.CFG.OVERPASS_ENDPOINT;
  const params = new URLSearchParams();
  params.append("data", query);
  const TTL = S.CFG.CACHE_TTL_MS;
  try {
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (parsed && parsed.ts && Array.isArray(parsed.items)) {
        if (Date.now() - parsed.ts < TTL) return parsed.items;
        else
          try {
            localStorage.removeItem(cacheKey);
          } catch (e) {}
      }
    }
  } catch (e) {}
  try {
    showSpinner(undefined, S.CFG.SPINNER_TEXT);
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body: params.toString(),
    });
    const text = await resp.text();
    if (!resp.ok) throw { status: resp.status, rawBody: text };
    const data = JSON.parse(text);
    const items = data.elements
      .map((el) => {
        const name =
          (el.tags && (el.tags.name || el.tags["name:en"])) || "unknown";
        const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
        const lon = el.lon !== undefined ? el.lon : el.center && el.center.lon;
        let pop = null;
        if (el.tags && el.tags.population) {
          const cleaned = String(el.tags.population).replace(/[^0-9]/g, "");
          const n = cleaned ? Number(cleaned) : NaN;
          if (!isNaN(n)) pop = n;
        }
        return { name, lat, lon, population: pop };
      })
      .filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lon));
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), items }));
    } catch (e) {}
    return items;
  } catch (err) {
    let statusCode = err.status || "Network";
    let errorMessage = "";
    let explanation = "";
    function extractErrorMessage(rawBody) {
      if (!rawBody) return "";
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(rawBody, "text/html");
        const body = doc.body.textContent || doc.body.innerText || "";
        return body.trim().slice(0, 200) || "No error details provided";
      } catch (e) {
        const firstLine = rawBody.split("\n")[0].trim();
        return firstLine.length < 200 ? firstLine : firstLine.slice(0, 200);
      }
    }
    switch (statusCode) {
      case 400:
        explanation = " (Bad Request - Invalid query syntax)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case 404:
        explanation = " (Not Found - Endpoint does not exist)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case 429:
        explanation = " (Too Many Requests - Rate limited)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case 500:
        explanation = " (Internal Server Error)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case 502:
        explanation = " (Bad Gateway)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case 503:
        explanation = " (Service Unavailable)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case 504:
        explanation = " (Gateway Timeout)";
        errorMessage = extractErrorMessage(err.rawBody);
        break;
      case "Network":
        explanation = "";
        errorMessage =
          "Cannot connect to " +
          endpoint +
          ". The URL may be incorrect or the server may be down.";
        break;
      default:
        if (statusCode >= 500) explanation = " (Server Error)";
        else if (statusCode >= 400) explanation = " (Client Error)";
        errorMessage =
          extractErrorMessage(err.rawBody) || err.message || "Unknown error";
    }
    if (!errorMessage) errorMessage = "Unknown error";
    const finalMessage =
      statusCode === "Network"
        ? errorMessage
        : "HTTP " + statusCode + explanation + ": " + errorMessage;
    throw new Error(finalMessage);
  } finally {
    hideSpinner();
  }
}

export async function cacheKeyFromQuery(query) {
  try {
    const enc = new TextEncoder().encode(query);
    const hash = await (crypto.subtle || crypto.webkitSubtle).digest(
      "SHA-1",
      enc
    );
    const hex = Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return "overpass_" + hex;
  } catch (e) {
    let h = 0;
    for (let i = 0; i < query.length; i++) {
      h = (h << 5) - h + query.charCodeAt(i);
      h |= 0;
    }
    return "overpass_" + (h >>> 0).toString(16);
  }
}

export async function runQueryAndRender(
  query,
  errPrefix = "Error fetching data: "
) {
  try {
    const key = await cacheKeyFromQuery(query);
    const fetched = await fetchOverpass(query, key);
    fetched.sort((a, b) => (b.population || 0) - (a.population || 0));
    await renderCities(fetched);
    if (fetched.length)
      S.map.setView([fetched[0].lat, fetched[0].lon], S.CFG.MAP_DEFAULT_ZOOM);
    return fetched;
  } catch (err) {
    alert(errPrefix + err.message);
    console.error(err);
    return null;
  }
}
