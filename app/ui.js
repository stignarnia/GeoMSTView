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
