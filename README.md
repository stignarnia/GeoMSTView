# Prim MST — Minimum Spanning Tree visualization (OpenStreetMap)

Simple interactive demo that computes and visualizes a Minimum Spanning Tree (MST) over a set of cities sourced from OpenStreetMap. The map is rendered with Leaflet and heavy computation (distance matrix, Prim, great-circle points) runs in a Web Worker to keep the UI responsive.

## Quick start

1. View the hosted demo at: https://geomstview.pages.dev.
2. Install it as an app if you want! (It's a PWA, visit the link in Chrome or Safari on your phone and use "Install app" from the menu.)
3. To run it locally you must use a local static server (see below) — double-clicking `index.html` will not work.
4. Choose a dataset from the `Dataset` control: `capitals` (built-in sample), `preset` (a larger preset Overpass query), or `custom` to paste/run your own Overpass QL query.
5. Press the ▶ `Start` button to animate MST edges being added. Use `Reset` to clear the animation or `🗑` to invalidate cached Overpass results for the current query.
6. Use the `Animation speed` slider to slow down or speed up the edge animation.
7. Press the 📹 `Export GIF` button to export the animation as a downloadable GIF file.

## GIF Export

The GIF export feature allows you to download the MST animation as an animated GIF file:

- Click the 📹 button in the control panel to start the export process.
- The UI will be hidden during frame capture.
- A progress bar will show the status.
- The GIF will automatically download when complete.
- Export uses the current map view (center and zoom level).
- It will aim for `1080p@15fps` which is amazing for a GIF, but it will throttle down with the animation duration due to WebAssembly memory limitations (it may even run out of memory entirely on extremely long animations).

If running locally, export settings can be configured in `settings.json` under the `GIF_EXPORT` key:

- `MAX_COLORS`: Maximum GIF palette colors (default: 256). Limits encoder palette size to bound memory and file size.
- `CAPTURE_FPS`: Target capture frames per second (default: 15).
- `MIN_FPS`: Minimum allowed frames per second (default: 10). If reducing the resolution is not enough to fit memory limits, frames per second will be reduced, if the required reduction brings it below this value, an error will be thrown.
- `INITIAL_FRAME_DELAY_MS` / `FINAL_FRAME_DELAY_MS`: How long to keep the first and final frames visible (default 500ms each).
- `MAX_RESOLUTION`: Target export resolution in pixels (default: 1080).
- `MIN_RESOLUTION`: Minimum export resolution in pixels (default: 480). Resolution is the first to be throttled if memory limits are hit.

## Custom Overpass queries

- Do not put comments in your Overpass query, as they may break parsing. (no `//` or `/* ... */`).
- Overpass is very slow and sometimes it will rate limit you: try a different Overpass endpoint or reduce the query area/complexity.
- You can ask AI to help you with making custom overpass queries for your area of interest, just give it the preset one to make it understand what you are talking about.
- if you just want to change region, country, or local administrative area, you must change change the area at line 2 with the desired ISO 3166 code. You can find that at https://www.iso.org/obp/ui/#search.
- To change which places you get, edit the filter `["place"~"city|town"]` by replacing or adding place types (e.g., "city", "town", "village", "hamlet", "suburb", "neighbourhood"), such as `["place"="city"]` for only cities, `["place"~"city|town|village"]` for multiple types, or simply `["place"]` to include any place.

## Settings (only if running locally)

If you want to change default behavior (tile server, animation defaults, k-nearest limits, etc.) edit the `settings.json` file.

Key `CFG` entries you might change:

- `TILE_URL`: map tile server URL (default: Carto dark tiles). You may get `CORS` errors if the tile server does not allow cross-origin requests, which are needed for exporting GIFs but apply to the whole website.
- `CACHE_TTL_MS`: how long Overpass results are kept in `IndexedDB` (milliseconds).
- `SPEED_RANGE`: slider configuration and default value (min/max/step/default). Note: the code maps the slider inversely to animation delay.
- `K_MIN`, `K_MAX`, `HOLD_LEVELS`, `TARGET_ZOOM_OFFSET`: control how many candidate neighbor lines are shown at different zoom levels.
- `GC_*` values (`GC_MIN_SEGMENTS`, `GC_MAX_SEGMENTS`, `GC_SEGMENT_FACTOR`): control visual segmentation for great-circle curves between cities.
- Many more, including most `CSS` variables used for theming.

After editing `settings.json`, reload the page.

## Performance & limits

- The demo builds a full pairwise distance matrix and runs Prim's algorithm; it's fast for small and medium datasets (tens–low hundreds of cities) but will slow down for thousands of cities.
- If a query returns a very large number of results the page may become slow or the Overpass server may time out — choose smaller areas or refine queries.

## Serving locally (required if not using the hosted demo)

This project must be built and served over HTTP (double-clicking `index.html` will not work).

Quick options to run it, after [installing Node.js](https://nodejs.org/en/download/current):

```bash
npm install
npm run dev

# then open the URL printed by the command (usually http://localhost:5173)
```

## Project files

- `index.html` — page entry and layout.
- `styles.css` — UI styles.
- `settings.json` — configuration defaults (tile server, animation and performance settings).
- `package.json` — scripts and dependencies.
- `vite.config.js` — Vite configuration (PWA configuration and headers for the development server).
- `public/favicon.png` — favicon.
- `_headers` — Sets correct CORS headers for Cloudflare Pages.
- `app/` — ES module sources for the application and worker:
  - `main.js` — application entry (wires UI, worker and rendering).
  - `init.js` — map initialization and theme handling.
  - `render.js` — rendering and layer management (markers, candidate/MST drawing).
  - `animation.js` — animation logic for growing MST edges.
  - `worker.js` — Web Worker implementation (MST, distances, great-circle points).
  - `shared.js` — pure math helpers shared between main thread and worker (`haversine`, `greatCirclePoints`, `gcKey`, `dedent`).
  - `utils.js` — utility helpers (`computeCitiesKey`, `lerpColor`, wrappers).
  - `worker-comm.js` — worker creation and messaging helpers.
  - `state.js` — shared runtime state object.
  - `api.js` — Overpass fetch, caching and query helpers.
  - `ui.js` — UI helper utilities (spinner, controls).
  - `export-gif.js` — GIF export (frame capture and encoding).
  - `wasm-loader.js` — WebAssembly loader (downloads `ffmpeg.wasm` for the conversion from the WebM capture to the GIF format).