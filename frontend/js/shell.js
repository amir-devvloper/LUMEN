/* LUMEN — shared page shell: date chip + signed-in user in the sidebar.
   Loaded on every app page after config/api/ui. If the API is unreachable the
   static markup (the design's demo values) is left as it is. */
(function (LUMEN) {
  "use strict";

  const { fill, dateLabel } = LUMEN.ui;

  fill({ today: dateLabel() });

  LUMEN.api.me().then(function (user) {
    if (!user) return;
    fill({
      "user-name": user.name,
      "user-plan": user.plan,
      "user-first": String(user.name || "").split(" ")[0]
    });
    LUMEN.user = user;
  }).catch(function () { /* offline: keep the demo markup */ });
})(window.LUMEN);
