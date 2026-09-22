/* LUMEN — login + signup forms. */
(function (LUMEN) {
  "use strict";

  const form = document.querySelector("[data-auth-form]");
  if (!form) return;

  const kind = form.getAttribute("data-auth-form"); /* "login" | "register" */
  const errorEl = form.querySelector("[data-auth-error]");
  const submit = form.querySelector("[data-auth-submit]");

  /* already signed in -> straight to the app */
  if (LUMEN.api.token()) location.replace("dashboard.html");

  function showError(message, input) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    form.querySelectorAll("input").forEach(function (i) { i.removeAttribute("aria-invalid"); });
    if (input) { input.setAttribute("aria-invalid", "true"); input.focus(); }
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    errorEl.hidden = true;

    const data = new FormData(form);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const password = String(data.get("password") || "");

    if (kind === "register" && !name) return showError("Enter your name.", form.elements.namedItem("name"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Enter a valid email address.", form.elements.namedItem("email"));
    if (!password) return showError("Enter your password.", form.elements.namedItem("password"));
    if (kind === "register" && password.length < 8) return showError("Password must be at least 8 characters.", form.elements.namedItem("password"));

    submit.disabled = true;
    try {
      const session = kind === "register"
        ? await LUMEN.api.register(name, email, password)
        : await LUMEN.api.login(email, password);
      LUMEN.api.setToken(session.token);
      /* a brand-new account goes through onboarding first */
      location.href = kind === "register" ? "onboarding.html" : "dashboard.html";
    } catch (err) {
      /* fetch() rejects with a TypeError when the server isn't reachable */
      showError(err instanceof TypeError ? "Can't reach the server. Is the backend running?" : err.message);
      submit.disabled = false;
    }
  });
})(window.LUMEN);
