/* LUMEN — persistent player bar. Transport controls are client-side; the
   "now playing" track and the like button come from the backend, and fall back
   to the design's placeholder track when the API is unreachable. */
(function (LUMEN) {
  "use strict";

  const { $, bindTrack, setPlayIcon } = LUMEN.ui;

  const bar = $("[data-player]");
  if (!bar) return;

  const el = {
    play:     $('[data-action="play"]', bar),
    prev:     $('[data-action="prev"]', bar),
    next:     $('[data-action="next"]', bar),
    like:     $('[data-action="like"]', bar),
    mute:     $('[data-action="mute"]', bar),
    title:    $("[data-player-title]", bar),
    artist:   $("[data-player-artist]", bar),
    art:      $("[data-player-art]", bar),
    elapsed:  $("[data-player-elapsed]", bar),
    duration: $("[data-player-duration]", bar),
    seek:     $("[data-seek]", bar),
    volume:   $("[data-volume]", bar)
  };

  const state = { playing: true, position: 134, duration: 588, volume: 0.62, muted: false, trackId: null };

  function time(seconds) {
    const s = Math.max(0, Math.round(seconds));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  const seek = bindTrack(el.seek, {
    onChange: function (ratio) {
      state.position = ratio * state.duration;
      renderPosition();
    }
  });

  const volume = bindTrack(el.volume, {
    onChange: function (ratio) {
      state.volume = ratio;
      state.muted = ratio === 0;
    }
  });

  function renderPosition() {
    if (el.elapsed) el.elapsed.textContent = time(state.position);
    if (seek) seek.set(state.duration ? state.position / state.duration : 0);
  }

  function setPlaying(playing) {
    state.playing = playing;
    setPlayIcon(el.play, playing);
  }

  function setLiked(liked) {
    if (!el.like) return;
    el.like.setAttribute("aria-pressed", String(liked));
    el.like.setAttribute("aria-label", liked ? "Remove from library" : "Save to library");
    const icon = $("svg", el.like);
    if (icon) icon.setAttribute("fill", liked ? "currentColor" : "none");
  }

  /** Show a track from the API in the bar. */
  function setTrack(track) {
    state.trackId = track.id;
    state.duration = track.duration_seconds || state.duration;
    state.position = 0;

    if (el.title)  el.title.textContent = track.title;
    if (el.artist) el.artist.textContent = track.album ? track.artist + " / " + track.album : track.artist;
    if (el.duration) el.duration.textContent = time(state.duration);
    if (el.art && track.cover_url) el.art.src = track.cover_url;

    setLiked(!!track.liked);
    renderPosition();
  }

  if (el.play) el.play.addEventListener("click", function () { setPlaying(!state.playing); });
  if (el.prev) el.prev.addEventListener("click", function () { state.position = 0; renderPosition(); });
  if (el.next) el.next.addEventListener("click", function () { state.position = 0; renderPosition(); });

  if (el.like) el.like.addEventListener("click", function () {
    const wasLiked = el.like.getAttribute("aria-pressed") === "true";
    setLiked(!wasLiked); /* optimistic */

    if (!state.trackId) return; /* placeholder track: local toggle only */
    LUMEN.api.toggleFavorite(state.trackId)
      .then(function (res) { setLiked(res.liked); })
      .catch(function () { setLiked(wasLiked); });
  });

  if (el.mute) el.mute.addEventListener("click", function () {
    state.muted = !state.muted;
    if (volume) volume.set(state.muted ? 0 : state.volume);
    el.mute.setAttribute("aria-label", state.muted ? "Unmute" : "Mute");
  });

  setInterval(function () {
    if (!state.playing) return;
    state.position = Math.min(state.duration, state.position + 1);
    renderPosition();
  }, 1000);

  renderPosition();
  setPlayIcon(el.play, state.playing);

  LUMEN.api.nowPlaying().then(function (track) {
    if (track) setTrack(track);
  }).catch(function () { /* offline: keep the placeholder track */ });

  LUMEN.player = { setPlaying: setPlaying, setTrack: setTrack, state: state };
})(window.LUMEN);
