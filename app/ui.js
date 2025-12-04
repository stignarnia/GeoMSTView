import { dedent } from "./shared.js";
import { getRecord, putRecord, removeRecord } from "./utils.js";
import { S } from "./state.js";

let closeCb = null;

export function showSpinner(text, defaultText) {
  const s = document.getElementById("spinner");
  const st = document.getElementById("spinnerText");
  if (s) s.classList.add("visible"), s.setAttribute("aria-hidden", "false");
  if (st) {
    st.classList.add("visible");
    st.textContent = text !== undefined ? text : defaultText || "Loading...";
    st.setAttribute("aria-hidden", "false");
  }
}

export function hideSpinner() {
  const s = document.getElementById("spinner");
  const st = document.getElementById("spinnerText");
  if (s) s.classList.remove("visible"), s.setAttribute("aria-hidden", "true");
  if (st)
    st.classList.remove("visible"), st.setAttribute("aria-hidden", "true");
}

const getDefaultQuery = () => (S && S.CFG && S.CFG.DEFAULT_CITIES_QUERY) || "";

export async function loadSavedQuery(storageKey, defaultQuery = getDefaultQuery()) {
  try {
    const rec = await getRecord(storageKey);
    if (rec && typeof rec.value !== "undefined") return dedent(rec.value);
    const def = dedent(defaultQuery);
    try {
      await putRecord(storageKey, { ts: Date.now(), value: def });
    } catch (e) {}
    return def;
  } catch (e) {
    return dedent(defaultQuery);
  }
}

export function updateEditButton() {
  const editCustomBtn = document.getElementById("editCustom");
  const datasetSelectEl = document.getElementById("datasetSelect");
  if (!editCustomBtn || !datasetSelectEl) return;
  const show = datasetSelectEl.value === "custom";
  editCustomBtn.classList.toggle("visible", show);
  editCustomBtn.setAttribute("aria-hidden", show ? "false" : "true");
}

export function updateMstTotal(mst = null) {
  try {
    const arr = Array.isArray(mst) ? mst : (S.currentMST || []);
    const total = (arr || []).reduce((s, e) => s + (e.w || 0), 0).toFixed(2);
    const edges = (arr || []).length;
    const el = document.getElementById("mstTotal");
    if (el)
      el.textContent = "MST total length: " + total + " km — " + edges + " edges";
  } catch (e) { }
}

function animateShow(modal) {
  if (!modal) return;
  modal.style.display = "flex";
  modal.offsetWidth; // force reflow
  modal.classList.add("visible");
  modal.setAttribute("aria-hidden", "false");
}

function animateHide(modal) {
  return new Promise((resolve) => {
    if (!modal) return resolve();
    modal.classList.remove("visible");
    const onEnd = (ev) => {
      if (ev.target !== modal) return;
      modal.removeEventListener("transitionend", onEnd, true);
      modal.style.display = "none";
      modal.setAttribute("aria-hidden", "true");
      resolve();
    };
    modal.addEventListener("transitionend", onEnd, true);
  });
}

export async function openCustomModal() {
  const modal = document.getElementById("customModal");
  const textarea = document.getElementById("customQuery");
  const mapEl = document.getElementById("map");
  const controlsEl = document.querySelector(".controls");
  if (!modal || !textarea) return;
  textarea.value = await loadSavedQuery(S.CUSTOM_QUERY_KEY, getDefaultQuery());
  if (mapEl) mapEl.setAttribute("aria-hidden", "true"), (mapEl.inert = true);
  if (controlsEl)
    controlsEl.setAttribute("aria-hidden", "true"), (controlsEl.inert = true);
  animateShow(modal);
  textarea.focus();

  const keyHandler = (e) => {
    if (e.key === "Escape") return closeCustomModal("cancel");
    if (e.key === "Tab") {
      const focusable = Array.from(
        modal.querySelectorAll(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0],
        last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  document.addEventListener("keydown", keyHandler, true);
  modal._keyHandler = keyHandler;
}

export function closeCustomModal(reason) {
  const modal = document.getElementById("customModal");
  const mapEl = document.getElementById("map");
  const controlsEl = document.querySelector(".controls");
  if (!modal) return;
  if (modal._keyHandler) {
    document.removeEventListener("keydown", modal._keyHandler, true);
    modal._keyHandler = null;
  }
  if (mapEl) {
    mapEl.removeAttribute("aria-hidden");
    mapEl.inert = false;
  }
  if (controlsEl) {
    controlsEl.removeAttribute("aria-hidden");
    controlsEl.inert = false;
  }

  const active = document.activeElement;
  if (active && modal.contains(active)) {
    const prefer = ["collapseToggle", "start", "datasetSelect", "editCustom"];
    let moved = false;
    for (const id of prefer) {
      const el = document.getElementById(id);
      if (el && typeof el.focus === "function") {
        el.focus();
        moved = true;
        break;
      }
    }
    if (!moved && active.blur) active.blur();
  }

  animateHide(modal).then(() => {
    if (typeof closeCb === "function") closeCb(reason);
  });
}

export function initCustomModalHandlers({ onOk = null, onClose = null } = {}) {
  closeCb = onClose;
  const textarea = document.getElementById("customQuery");
  const revertBtn = document.getElementById("revertQuery");
  const okTop = document.getElementById("okTop");
  const closeBtn = document.getElementById("closeModal");
  if (textarea)
    textarea.addEventListener("input", async (e) => {
      try {
        await putRecord(S.CUSTOM_QUERY_KEY, { ts: Date.now(), value: e.target.value });
      } catch (e) { }
    });
  if (revertBtn)
    revertBtn.addEventListener("click", () => {
      const q = dedent(getDefaultQuery());
      if (textarea) {
        textarea.value = q;
        textarea.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  if (okTop)
    okTop.addEventListener("click", async () => {
      const q = textarea ? textarea.value : "";
      closeCustomModal("ok");
      if (typeof onOk === "function") await onOk(q);
    });
  if (closeBtn)
    closeBtn.addEventListener("click", () => closeCustomModal("cancel"));
}
