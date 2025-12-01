// Shared math utilities used by main thread and worker
// Attach to `self.__MST_shared` so they are available both in window and worker scopes
(function () {
  const toRad = (d) => (d * Math.PI) / 180;
  const toDeg = (r) => (r * 180) / Math.PI;

  function haversine(a, b, R = 6371) {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat),
      lat2 = toRad(b.lat);
    const sinDlat = Math.sin(dLat / 2),
      sinDlon = Math.sin(dLon / 2);
    const aa = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
    const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    return R * c;
  }

  function greatCirclePoints(a, b, opts = {}) {
    const GC_MIN_SEGMENTS = opts.GC_MIN_SEGMENTS || 6;
    const GC_MAX_SEGMENTS = opts.GC_MAX_SEGMENTS || 128;
    const GC_SEGMENT_FACTOR = opts.GC_SEGMENT_FACTOR || 0.2;
    const R = opts.DISTANCE_RADIUS_KM || 6371;

    const lat1 = toRad(a.lat),
      lon1 = toRad(a.lon);
    const lat2 = toRad(b.lat),
      lon2 = toRad(b.lon);
    const sinDlat = Math.sin((lat2 - lat1) / 2);
    const sinDlon = Math.sin((lon2 - lon1) / 2);
    const aa = sinDlat * sinDlat + Math.cos(lat1) * Math.cos(lat2) * sinDlon * sinDlon;
    const d = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
    if (d === 0) return [[a.lat, a.lon], [b.lat, b.lon]];
    const denom = Math.sin(d);
    if (Math.abs(denom) < 1e-9) return [[a.lat, a.lon], [b.lat, b.lon]];

    const dist = haversine(a, b, R);
    const segments = Math.min(GC_MAX_SEGMENTS, Math.max(GC_MIN_SEGMENTS, Math.round(dist * GC_SEGMENT_FACTOR)));
    const pts = [];
    for (let i = 0; i <= segments; i++) {
      const f = i / segments;
      const A = Math.sin((1 - f) * d) / denom;
      const B = Math.sin(f * d) / denom;
      const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
      const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
      const z = A * Math.sin(lat1) + B * Math.sin(lat2);
      const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
      const lon = Math.atan2(y, x);
      pts.push([toDeg(lat), toDeg(lon)]);
    }
    return pts;
  }

  try {
    self.__MST_shared = self.__MST_shared || {};
    self.__MST_shared.haversine = haversine;
    self.__MST_shared.greatCirclePoints = greatCirclePoints;
    // helper: remove common indentation and surrounding blank lines
    function dedent(str) {
      if (str == null) return "";
      const txt = String(str).replace(/\r\n/g, "\n").replace(/\t/g, "    ");
      const lines = txt.split("\n");
      while (lines.length && lines[0].trim() === "") lines.shift();
      while (lines.length && lines[lines.length - 1].trim() === "") lines.pop();
      const indents = lines.filter((l) => l.trim()).map((l) => (l.match(/^[ \t]*/)[0] || "").length);
      const minIndent = indents.length ? Math.min(...indents) : 0;
      return lines.map((l) => l.slice(minIndent).replace(/[ \t]+$/, "")).join("\n");
    }
    self.__MST_shared.dedent = dedent;
    // canonical key for a city pair (used to index GC points / caches)
    function gcKey(a, b) {
      const x = Math.min(Number(a), Number(b));
      const y = Math.max(Number(a), Number(b));
      return x + "|" + y;
    }
    self.__MST_shared.gcKey = gcKey;
  } catch (e) {
    // ignore in exotic environments
  }
})();
