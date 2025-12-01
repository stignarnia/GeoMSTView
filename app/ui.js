import { dedent } from "./utils.js";

const CUSTOM_QUERY_KEY = "overpass_custom_query_v1";

let _onOk = null;
let _onClose = null;

export function showSpinner(text, defaultText) {
  try {
    const s = document.getElementById("spinner");
    const st = document.getElementById("spinnerText");
    if (s) s.style.display = "inline-block";
    if (st) {
      st.style.display = "inline-block";
      st.textContent = text !== undefined ? text : defaultText || "Loading...";
    }
  } catch (e) {}
}

export function hideSpinner() {
  try {
    const s = document.getElementById("spinner");
    const st = document.getElementById("spinnerText");
    if (s) s.style.display = "none";
    if (st) st.style.display = "none";
  } catch (e) {}
}

function getFocusableElements(root) {
  return Array.from(
    root.querySelectorAll(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
    )
  ).filter(
    (el) =>
      el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
  );
}

export function loadSavedQuery(
  storageKey,
  defaultQuery = (window.S &&
    window.S.CFG &&
    window.S.CFG.DEFAULT_CITIES_QUERY) ||
    ""
) {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return dedent(saved);
    const def = dedent(defaultQuery);
    try {
      localStorage.setItem(storageKey, def);
    } catch (e) {}
    return def;
  } catch (e) {
    return dedent(defaultQuery);
  }
}

export function updateEditButton() {
  try {
    const editCustomBtn = document.getElementById("editCustom");
    const datasetSelectEl = document.getElementById("datasetSelect");
    if (!editCustomBtn || !datasetSelectEl) return;
    editCustomBtn.style.visibility =
      datasetSelectEl.value === "custom" ? "visible" : "hidden";
  } catch (e) {}
}

export function openCustomModal() {
  try {
    const modal = document.getElementById("customModal");
    const textarea = document.getElementById("customQuery");
    const mapEl = document.getElementById("map");
    const controlsEl = document.querySelector(".controls");
    if (!modal || !textarea) return;
    textarea.value = loadSavedQuery(
      CUSTOM_QUERY_KEY,
      (window.S && window.S.CFG && window.S.CFG.DEFAULT_CITIES_QUERY) || ""
    );
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    if (mapEl) mapEl.setAttribute("aria-hidden", "true");
    if (controlsEl) controlsEl.setAttribute("aria-hidden", "true");
    textarea.focus();

    const _modalKeydownHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCustomModal();
        return;
      }
      if (e.key === "Tab") {
        const focusable = getFocusableElements(modal);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
    document.addEventListener("keydown", _modalKeydownHandler, true);

    // store handler refs on modal element so closeCustomModal can remove listener
    modal._modalKeydownHandler = _modalKeydownHandler;
  } catch (e) {}
}

export function closeCustomModal() {
  try {
    const modal = document.getElementById("customModal");
    const mapEl = document.getElementById("map");
    const controlsEl = document.querySelector(".controls");
    if (!modal) return;
    modal.style.display = "none";
    modal.setAttribute("aria-hidden", "true");
    if (mapEl) mapEl.removeAttribute("aria-hidden");
    if (controlsEl) controlsEl.removeAttribute("aria-hidden");
    if (modal._modalKeydownHandler) {
      document.removeEventListener("keydown", modal._modalKeydownHandler, true);
      modal._modalKeydownHandler = null;
    }
    if (typeof _onClose === "function") {
      try {
        _onClose();
      } catch (e) {}
    }
  } catch (e) {}
}

export function initCustomModalHandlers({ onOk, onClose } = {}) {
  try {
    _onOk = onOk || null;
    _onClose = onClose || null;
    const textarea = document.getElementById("customQuery");
    const revertBtn = document.getElementById("revertQuery");
    const okTop = document.getElementById("okTop");
    const closeBtn = document.getElementById("closeModal");
    if (textarea) {
      textarea.addEventListener("input", (e) => {
        try {
          localStorage.setItem(CUSTOM_QUERY_KEY, e.target.value);
        } catch (e) {}
      });
    }
    if (revertBtn) {
      revertBtn.addEventListener("click", () => {
        try {
          textarea.value = dedent(
            (window.S && window.S.CFG && window.S.CFG.DEFAULT_CITIES_QUERY) ||
              ""
          );
          localStorage.setItem(CUSTOM_QUERY_KEY, textarea.value);
        } catch (e) {}
      });
    }
    if (okTop) {
      okTop.addEventListener("click", async () => {
        try {
          const q = textarea ? textarea.value : "";
          closeCustomModal();
          if (typeof _onOk === "function") {
            await _onOk(q);
          }
        } catch (e) {}
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        try {
          closeCustomModal();
          if (typeof _onClose === "function") _onClose();
        } catch (e) {}
      });
    }
  } catch (e) {}
}
