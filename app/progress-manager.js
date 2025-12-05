// Simple stage-based progress manager to produce consistent overall percentages
export class ProgressManager {
  constructor(stages, domUpdater) {
    this.stages = stages || {
      prepare: 3,
      loading: 7,
      capturing: 50,
      writing: 5,
      encoding: 30,
      reading: 5,
    };
    this.domUpdater = domUpdater || (() => {});
    this.computeTotals();
    this.current = null;
  }

  computeTotals() {
    this.totalWeight = Object.values(this.stages).reduce((s, v) => s + v, 0) || 100;
    this.cumulative = {};
    let run = 0;
    for (const k of Object.keys(this.stages)) {
      this.cumulative[k] = run;
      run += this.stages[k];
    }
  }

  setUpdater(fn) { this.domUpdater = fn; }

  setStage(stage, status = "", details = "") {
    if (!(stage in this.stages)) stage = Object.keys(this.stages)[0];
    this.current = stage;
    this.updateStageProgress(stage, 0, details, status);
  }

  updateStageProgress(stage, fraction = 0, details = "", status = "") {
    if (!(stage in this.stages)) return;
    fraction = Math.max(0, Math.min(1, Number(fraction) || 0));
    const before = this.cumulative[stage];
    const weight = this.stages[stage];
    const percent = ((before + weight * fraction) / this.totalWeight) * 100;
    const pct = Math.max(0, Math.min(100, Number(percent.toFixed(2))));
    this.domUpdater(pct, status || this.defaultStatusFor(stage, fraction), details || `${Math.round(fraction * 100)}%`);
  }

  absolute(pct, status = "", details = "") {
    const p = Math.max(0, Math.min(100, Number(pct) || 0));
    this.domUpdater(p, status, details);
  }

  defaultStatusFor(stage, fraction) {
    switch (stage) {
      case "prepare": return "Preparing...";
      case "loading": return "Loading FFmpeg...";
      case "capturing": return `Capturing (${Math.round(fraction * 100)}%)`;
      case "writing": return `Writing frames (${Math.round(fraction * 100)}%)`;
      case "encoding": return `Encoding (${Math.round(fraction * 100)}%)`;
      case "reading": return "Finalizing...";
      default: return "Working...";
    }
  }
}

export const progressManager = new ProgressManager();
