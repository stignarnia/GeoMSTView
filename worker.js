// Worker: compute MST and great-circle latlngs (k-nearest up to kMax)
self.importScripts && importScripts("shared.js");
self.addEventListener("message", async (ev) => {
  const msg = ev.data || {};
  if (msg.type === "compute") {
    const cities = msg.cities || [];
    const cfg = msg.cfg || {};
    const K_MAX = cfg.K_MAX || 16;
    const GC_MIN_SEGMENTS = cfg.GC_MIN_SEGMENTS || 6;
    const GC_MAX_SEGMENTS = cfg.GC_MAX_SEGMENTS || 128;
    const GC_SEGMENT_FACTOR = cfg.GC_SEGMENT_FACTOR || 0.2;
    const R = cfg.DISTANCE_RADIUS_KM || 6371;

    const shared = self.__MST_shared || {};
    const haversine =
      shared.haversine ||
      function (a, b) {
        return 0;
      };
    const greatCirclePoints =
      shared.greatCirclePoints ||
      function (a, b) {
        return [
          [a.lat, a.lon],
          [b.lat, b.lon],
        ];
      };

    // compute pairwise distances (upper triangular)
    const n = cities.length;
    const dist = new Array(n).fill(null).map(() => new Array(n).fill(0));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = haversine(cities[i], cities[j], R);
        dist[i][j] = d;
        dist[j][i] = d;
      }
    }

    // MST algorithm selection
    const algorithm = msg.algorithm || "prim";
    const mst = [];

    if (algorithm === "kruskal") {
      // Kruskal's algorithm using Union-Find
      // Build edge list
      const edges = [];
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          edges.push({ u: i, v: j, w: dist[i][j] });
        }
      }
      // Sort edges by weight
      edges.sort((a, b) => a.w - b.w);

      // Union-Find data structure
      const parent = new Array(n).fill(null).map((_, i) => i);
      const rank = new Array(n).fill(0);

      function find(x) {
        if (parent[x] !== x) {
          parent[x] = find(parent[x]); // Path compression
        }
        return parent[x];
      }

      function union(x, y) {
        const rootX = find(x);
        const rootY = find(y);
        if (rootX === rootY) return false;

        // Union by rank
        if (rank[rootX] < rank[rootY]) {
          parent[rootX] = rootY;
        } else if (rank[rootX] > rank[rootY]) {
          parent[rootY] = rootX;
        } else {
          parent[rootY] = rootX;
          rank[rootX]++;
        }
        return true;
      }

      // Build MST
      for (const edge of edges) {
        if (union(edge.u, edge.v)) {
          mst.push(edge);
          if (mst.length === n - 1) break; // MST complete
        }
      }
    } else {
      // Prim's algorithm (default)
      const inMST = new Array(n).fill(false);
      const minDist = new Array(n).fill(Infinity);
      const parent = new Array(n).fill(-1);
      if (n > 0) {
        minDist[0] = 0;
        for (let iter = 0; iter < n; iter++) {
          let u = -1,
            best = Infinity;
          for (let i = 0; i < n; i++)
            if (!inMST[i] && minDist[i] < best) {
              best = minDist[i];
              u = i;
            }
          if (u === -1) break;
          inMST[u] = true;
          if (parent[u] !== -1) mst.push({ u: parent[u], v: u, w: best });
          for (let v = 0; v < n; v++) {
            if (inMST[v] || v === u) continue;
            const d = dist[u][v];
            if (d < minDist[v]) {
              minDist[v] = d;
              parent[v] = u;
            }
          }
        }
      }
    }

    // compute k-max nearest neighbors and their great-circle points
    // ensure k is at least 1 and at most n-1 (can't be neighbor to self)
    const k = Math.max(1, Math.min(K_MAX, n > 0 ? n - 1 : 1));
    const candidatePairs = new Map();
    const neighbors = new Array(n).fill(null).map(() => []);
    for (let i = 0; i < n; i++) {
      const arr = [];
      for (let j = 0; j < n; j++) {
        if (i !== j) arr.push([dist[i][j], j]);
      }
      arr.sort((a, b) => a[0] - b[0]);
      const top = arr.slice(0, Math.min(k, arr.length));
      neighbors[i] = top.map((x) => x[1]);
      top.forEach((item) => {
        const j = item[1];
        const a = Math.min(i, j),
          b = Math.max(i, j);
        const key = shared && shared.gcKey ? shared.gcKey(a, b) : a + "|" + b;
        if (!candidatePairs.has(key)) {
          candidatePairs.set(
            key,
            greatCirclePoints(cities[a], cities[b], {
              GC_MIN_SEGMENTS: GC_MIN_SEGMENTS,
              GC_MAX_SEGMENTS: GC_MAX_SEGMENTS,
              GC_SEGMENT_FACTOR: GC_SEGMENT_FACTOR,
              DISTANCE_RADIUS_KM: R,
            })
          );
        }
      });
    }

    // also ensure MST edges have GC points
    const mstGC = new Map();
    mst.forEach((e) => {
      const a = Math.min(e.u, e.v),
        b = Math.max(e.u, e.v);
      const key = shared && shared.gcKey ? shared.gcKey(a, b) : a + "|" + b;
      if (!candidatePairs.has(key)) {
        mstGC.set(
          key,
          greatCirclePoints(cities[a], cities[b], {
            GC_MIN_SEGMENTS: GC_MIN_SEGMENTS,
            GC_MAX_SEGMENTS: GC_MAX_SEGMENTS,
            GC_SEGMENT_FACTOR: GC_SEGMENT_FACTOR,
            DISTANCE_RADIUS_KM: R,
          })
        );
      } else {
        mstGC.set(key, candidatePairs.get(key));
      }
    });

    // serialize candidatePairs and mstGC into arrays
    const candidates = [];
    for (const [kstr, latlngs] of candidatePairs.entries())
      candidates.push({ key: kstr, latlngs });
    const mstLatlngs = [];
    for (const [kstr, latlngs] of mstGC.entries())
      mstLatlngs.push({ key: kstr, latlngs });

    // return results (include neighbors per node for zoom-based selection)
    self.postMessage({
      type: "result",
      mst,
      candidates,
      mstLatlngs,
      neighbors,
    });
  }
});

// end worker
