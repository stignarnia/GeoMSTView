# GeoMSTView - Copilot Instructions

## Project Overview

GeoMSTView is an interactive web application that visualizes Minimum Spanning Tree (MST) algorithms over geographic data from OpenStreetMap. The application uses Leaflet for map rendering and runs heavy computations in a Web Worker to maintain UI responsiveness.

## Tech Stack

- **Frontend Framework**: Vanilla JavaScript (ES modules)
- **Build Tool**: Vite
- **Map Library**: Leaflet
- **Progressive Web App**: VitePWA plugin
- **Data Source**: OpenStreetMap via Overpass API
- **Heavy Computation**: Web Workers
- **GIF Export**: FFmpeg WebAssembly, MediaBunny
- **Storage**: IndexedDB for caching Overpass results

## Project Structure

```
├── index.html           # Main HTML entry point
├── styles.css           # Global styles
├── settings.json        # Configuration (tile servers, animation, performance)
├── vite.config.js       # Vite and PWA configuration
├── package.json         # Dependencies and scripts
├── app/                 # ES modules
│   ├── main.js          # Application entry, wires UI and worker
│   ├── init.js          # Map initialization and theme handling
│   ├── render.js        # Rendering and layer management (markers, MST, candidates)
│   ├── animation.js     # Animation logic for MST edge growth
│   ├── worker.js        # Web Worker (MST algorithms, distances, great-circle points)
│   ├── shared.js        # Pure math helpers (haversine, greatCirclePoints)
│   ├── utils.js         # Utility helpers (caching, keys, color interpolation)
│   ├── worker-comm.js   # Worker creation and messaging
│   ├── state.js         # Shared runtime state
│   ├── api.js           # Overpass API fetch and caching
│   ├── ui.js            # UI utilities (spinner, controls, modals)
│   ├── export-gif.js    # GIF export (frame capture and encoding)
│   ├── wasm-loader.js   # WebAssembly loader for FFmpeg
│   └── progress-manager.js # Progress bar management during export
└── public/              # Static assets copied to build
    ├── favicon.png
    └── _headers         # CORS headers for Cloudflare Pages
```

## Development Commands

- `npm install` - Install dependencies
- `npm run dev` - Start Vite development server (usually http://localhost:5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build locally

## Coding Conventions

### General

- Use ES modules (`import`/`export`)
- Use modern JavaScript features (ES6+)
- Keep functions pure where possible, especially in `shared.js`
- Use async/await for asynchronous operations
- Prefer `const` over `let`, avoid `var`

### File Organization

- **main.js**: Entry point, orchestrates initialization
- **worker.js**: All heavy computation (MST algorithms, distance matrix)
- **shared.js**: Pure functions used by both main thread and worker (no side effects)
- **render.js**: All Leaflet rendering logic (markers, polylines, layers)
- **animation.js**: Animation state and timing logic
- **ui.js**: DOM manipulation and UI state
- **state.js**: Single source of truth for runtime state (`S` object)

### State Management

- Global state is in `state.js` exported as `S`
- Settings from `settings.json` are loaded into `S.CFG`
- Avoid mutating state outside of clear state update functions
- Use `utils.js` helpers for settings persistence (localStorage)

### Web Worker Communication

- Use `worker-comm.js` helpers for messaging
- Worker messages follow format: `{ type: 'MESSAGE_TYPE', data: {...} }`
- Main thread sends work to worker, worker sends results back
- Heavy computation (MST, distance matrix, great-circle segments) must stay in worker

### Configuration

- **settings.json**: Contains all configurable values
  - Map tile URLs and attribution
  - Animation parameters (speed, duration factors)
  - Performance settings (k-nearest neighbors, cache TTL)
  - GIF export settings (FPS, resolution, memory limits)
- Changes to settings require page reload
- CSS variables can be customized in settings.json under appropriate keys

### Map Rendering

- Use Leaflet API conventions
- All rendering goes through `render.js`
- Separate layers for markers, candidate edges, MST edges
- Use `L.polyline()` for edges, custom markers via `L.divIcon()`
- Great-circle lines are segmented for visual accuracy on spherical surface

### Performance

- Keep large datasets processing in worker
- Cache Overpass results in IndexedDB with TTL
- Use k-nearest neighbor optimization to limit candidate edge rendering
- Adjust rendering detail based on zoom level

### GIF Export

- Uses MediaCaptureStream API for frame capture
- FFmpeg WebAssembly for WebM to GIF conversion
- Memory-aware: automatically reduces resolution or FPS if needed
- Progress reporting through `progress-manager.js`

## Common Tasks

### Adding New Configuration

1. Add the setting to `settings.json`
2. Access via `S.CFG.YOUR_SETTING` after settings load
3. Document the setting in README.md if user-facing

### Adding New MST Algorithm

1. Implement algorithm in `worker.js`
2. Add to `algoSelect` dropdown in `index.html`
3. Update worker message handler to route to new algorithm
4. Test with various dataset sizes

### Modifying Animation

1. Animation logic is in `animation.js`
2. Timing parameters in `settings.json` (`EDGE_GROWTH_DURATION_FACTOR`, etc.)
3. Rendering of animated edges in `render.js`
4. Coordinate changes across these files

### Adding New Theme

1. Define tile URL and attribution in `settings.json`
2. Update theme toggle logic in `init.js`
3. Add CSS variables for the theme
4. Test tile loading and CORS compatibility

## Testing

- No automated test infrastructure currently exists
- Manual testing workflow:
  1. Start dev server: `npm run dev`
  2. Test with different datasets (capitals, preset, custom)
  3. Test different algorithms (Prim, Kruskal)
  4. Test animation controls (start, reset, speed)
  5. Test GIF export with various settings
  6. Test on different browsers and devices
  7. Test PWA installation

## Security & CORS

- Map tile servers must support CORS for GIF export
- FFmpeg WASM requires specific COOP/COEP headers (set in `vite.config.js` for dev)
- Cloudflare Pages production headers in `public/_headers`
- No user authentication or sensitive data handling

## Browser Support

- Modern browsers with ES6+ support
- Web Workers support required
- SharedArrayBuffer support required for FFmpeg WASM
- IndexedDB support for caching

## Performance Considerations

- Overpass API can be slow or rate-limit
- Very large datasets (thousands of cities) may cause slowness
- GIF export has memory limits based on WebAssembly heap size
- Worker computation scales O(n²) for distance matrix

## Code Style

- Use 2-space indentation (not explicitly enforced, but follow existing style)
- Use descriptive variable names
- Add comments for complex algorithms or non-obvious logic
- Keep functions focused and small when possible
- Prefer functional programming patterns where appropriate

## Making Changes

1. Always test locally before committing
2. Ensure no console errors in browser
3. Test with multiple datasets and zoom levels
4. Verify PWA still functions after changes
5. Check that GIF export works if you modified rendering
6. Update README.md if changing user-facing features or settings
7. Ensure changes work in both light and dark themes

## External Dependencies

- **Leaflet**: Map rendering library - follow their API conventions
- **Vite**: Build tool - minimal configuration needed
- **@ffmpeg/ffmpeg**: WebAssembly FFmpeg - used only in export-gif.js
- **mediabunny**: Video/canvas capture library for GIF export

## Known Limitations

- Overpass API rate limiting and timeouts
- GIF export memory constraints with long animations
- Large datasets may cause browser slowness
- Some tile servers don't support CORS (limits GIF export)

## Resources

- [Leaflet Documentation](https://leafletjs.com/)
- [Overpass API Documentation](https://wiki.openstreetmap.org/wiki/Overpass_API)
- [Vite Documentation](https://vitejs.dev/)
- [Web Workers MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
