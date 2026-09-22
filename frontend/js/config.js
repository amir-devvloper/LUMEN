/* LUMEN — runtime configuration shared by every page. */
window.LUMEN = window.LUMEN || {};

LUMEN.config = {
  /* Served by the backend itself (npm start) -> same-origin "/api".
     Opened from file:// or another local dev server -> talk to localhost:3000. */
  apiBase: location.protocol === "file:" ||
           ((location.hostname === "localhost" || location.hostname === "127.0.0.1") && location.port !== "3000")
    ? "http://localhost:3000/api"
    : "/api",

  tokenKey: "lumen.token",

  /* the preset picked during onboarding, pre-selected on the focus page */
  presetKey: "lumen.preset",

  /* focus presets, in minutes */
  presets: {
    deep:     { label: "Deep work",      preset: "Creative sprint", length: 90, break: 10 },
    sprint:   { label: "Sprint",         preset: "Short burst",     length: 25, break: 5 },
    ambient:  { label: "Ambient flow",   preset: "Low intensity",   length: 50, break: 10 }
  },

  /* shown when the API is unreachable, so the page is never empty */
  demo: true
};
