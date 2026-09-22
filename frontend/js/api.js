/* LUMEN — thin fetch wrapper around the backend. */
(function (LUMEN) {
  "use strict";

  const { apiBase, tokenKey } = LUMEN.config;

  function token() {
    try { return localStorage.getItem(tokenKey); } catch (_) { return null; }
  }

  function setToken(value) {
    try {
      if (value) localStorage.setItem(tokenKey, value);
      else localStorage.removeItem(tokenKey);
    } catch (_) { /* storage blocked: the session just won't persist */ }
  }

  async function request(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    const t = token();
    if (t) headers.Authorization = "Bearer " + t;

    const res = await fetch(apiBase + path, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    // A 401 from /auth/* is just "wrong email or password" — show it on the form.
    // Anywhere else it means the session is gone: drop the token and go to login
    // (doing this for /auth/login too made a failed login reload the page silently).
    if (res.status === 401 && !path.startsWith("/auth/")) {
      setToken(null);
      location.href = "login.html";
      throw new Error("Session expired");
    }

    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new Error((data && data.message) || "Request failed (" + res.status + ")");
    return data;
  }

  LUMEN.api = {
    get:  (p)    => request(p),
    post: (p, b) => request(p, { method: "POST", body: b }),
    put:  (p, b) => request(p, { method: "PUT", body: b }),
    del:  (p)    => request(p, { method: "DELETE" }),
    patch: (p, b) => request(p, { method: "PATCH", body: b }),

    token,
    setToken,
    login:    (email, password)       => request("/auth/login", { method: "POST", body: { email, password } }),
    register: (name, email, password) => request("/auth/register", { method: "POST", body: { name, email, password } }),
    logout:   () => setToken(null),

    me:              ()   => request("/users/me"),
    updateMe:        (patch) => request("/users/me", { method: "PATCH", body: patch }),
    startSession:    (preset, trackId) => request("/focus", { method: "POST", body: { preset, trackId } }),
    activeSession:   ()   => request("/focus/active"),
    pauseSession:    (id) => request("/focus/" + id + "/pause", { method: "POST" }),
    resumeSession:   (id) => request("/focus/" + id + "/resume", { method: "POST" }),
    completeSession: (id) => request("/focus/" + id + "/complete", { method: "POST" }),
    focusHistory:    ()   => request("/focus/history"),
    weekly:          ()   => request("/analytics/weekly"),
    monthly:         ()   => request("/analytics/monthly"),
    dailyStats:      ()   => request("/analytics/today"),
    heatmap:         ()   => request("/analytics/heatmap"),
    sessionMix:      ()   => request("/analytics/session-mix"),
    topSounds:       ()   => request("/analytics/top-sounds"),
    insight:         ()   => request("/ai/insight"),
    nowPlaying:      ()   => request("/music/now-playing"),
    toggleFavorite:  (trackId) => request("/music/" + encodeURIComponent(trackId) + "/favorite", { method: "POST" }),

    /** GET /music, optionally filtered by search term and ambient-only. */
    tracks: function (options) {
      const o = options || {};
      const query = new URLSearchParams();
      if (o.q) query.set("q", o.q);
      if (o.ambient) query.set("ambient", "true");
      const qs = query.toString();
      return request("/music" + (qs ? "?" + qs : ""));
    },
    favorites: () => request("/music/favorites"),

    playlists:          ()   => request("/playlists"),
    createPlaylist:     (name) => request("/playlists", { method: "POST", body: { name } }),
    deletePlaylist:     (id) => request("/playlists/" + encodeURIComponent(id), { method: "DELETE" }),
    playlistTracks:     (id) => request("/playlists/" + encodeURIComponent(id) + "/tracks"),
    addToPlaylist:      (id, trackId) => request("/playlists/" + encodeURIComponent(id) + "/tracks", { method: "POST", body: { trackId } }),
    removeFromPlaylist: (id, trackId) => request("/playlists/" + encodeURIComponent(id) + "/tracks/" + encodeURIComponent(trackId), { method: "DELETE" })
  };
})(window.LUMEN);
