const express = require("express");
const cors = require("cors");
const env = require("./config/env");
require("./config/databse"); // opens the DB and runs migrations on require

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const focusRoutes = require("./routes/focus.routes");
const analyticsRoutes = require("./routes/analytics.routes");
const musicRoutes = require("./routes/music.routes");
const playlistRoutes = require("./routes/playlist.routes");
const aiRoutes = require("./routes/ai.routes");

const { notFound, errorHandler } = require("./middleware/error.middleware");

const app = express();
app.disable("x-powered-by");

app.use(cors({ origin: env.corsOrigin }));
app.use(express.json());

app.get("/api/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/focus", focusRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/music", musicRoutes);
app.use("/api/playlists", playlistRoutes);
app.use("/api/ai", aiRoutes);

// Serve the frontend from the same origin, so `npm start` is all you need
// (http://localhost:3000). Must come after the API routes.
app.use(express.static(env.frontendDir));

app.use(notFound);
app.use(errorHandler);

// Only listen when run directly (`node backend/server.js`), so the app can be
// required by tests without opening a port.
if (require.main === module) {
  app.listen(env.port, () => {
    console.log("LUMEN backend listening on http://localhost:" + env.port);
  });
}

module.exports = app;
