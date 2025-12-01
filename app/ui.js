import { dedent } from "./utils.js";
import { S } from "./state.js";

let _onOk = null;
let _onClose = null;

export function showSpinner(text, defaultText) {
  try {
    const s = document.getElementById("spinner");
    const st = document.getElementById("spinnerText");
    if (s) {
      s.classList.add("visible");
      s.setAttribute("aria-hidden", "false");
    }
    if (st) {
      st.classList.add("visible");
      st.textContent = text !== undefined ? text : defaultText || "Loading...";
      st.setAttribute("aria-hidden", "false");
    }
  } catch (e) {}
}

export function hideSpinner() {
  try {
    const s = document.getElementById("spinner");
    const st = document.getElementById("spinnerText");
    if (s) {
      s.classList.remove("visible");
      s.setAttribute("aria-hidden", "true");
    }
    if (st) {
      st.classList.remove("visible");
      st.setAttribute("aria-hidden", "true");
    }
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
  defaultQuery = (S && S.CFG && S.CFG.DEFAULT_CITIES_QUERY) || ""
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
    const shouldShow = datasetSelectEl.value === "custom";
    if (shouldShow) {
      editCustomBtn.classList.add("visible");
      editCustomBtn.setAttribute("aria-hidden", "false");
    } else {
      editCustomBtn.classList.remove("visible");
      editCustomBtn.setAttribute("aria-hidden", "true");
    }
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
      S.CUSTOM_QUERY_KEY,
      (S && S.CFG && S.CFG.DEFAULT_CITIES_QUERY) || ""
    );
    modal.style.display = "flex";
    modal.setAttribute("aria-hidden", "false");
    if (mapEl) mapEl.setAttribute("aria-hidden", "true");
    if (controlsEl) controlsEl.setAttribute("aria-hidden", "true");
    textarea.focus();

    const _modalKeydownHandler = function (e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCustomModal("cancel");
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
    // reason: 'ok' when confirmed, 'cancel' when closed with X/ESC, undefined otherwise
    const reason = arguments.length ? arguments[0] : undefined;
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
        // pass reason so callers can decide whether to reset selection
        _onClose(reason);
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
          localStorage.setItem(S.CUSTOM_QUERY_KEY, e.target.value);
        } catch (e) {}
      });
    }
    if (revertBtn) {
      revertBtn.addEventListener("click", () => {
        try {
          if (!textarea) return;
          const q = dedent((S && S.CFG && S.CFG.DEFAULT_CITIES_QUERY) || "");
          textarea.value = q;
          try {
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
          } catch (e) {}
        } catch (e) {}
      });
    }
    if (okTop) {
      okTop.addEventListener("click", async () => {
        try {
          const q = textarea ? textarea.value : "";
          // close with 'ok' reason so onClose knows not to reset selection
          closeCustomModal("ok");
          if (typeof _onOk === "function") {
            await _onOk(q);
          }
        } catch (e) {}
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", () => {
        try {
          // close with 'cancel' reason to indicate user dismissed the modal
          closeCustomModal("cancel");
        } catch (e) {}
      });
    }
  } catch (e) {}
}
