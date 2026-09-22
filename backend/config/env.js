/**
 * Loads backend/.env (no dependency on the `dotenv` package — this project
 * only lists better-sqlite3, cors and express) and exposes typed config.
 */
const fs = require("fs");
const path = require("path");

const BACKEND_DIR = path.join(__dirname, "..");
const ROOT_DIR = path.join(BACKEND_DIR, "..");

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  // Strip a UTF-8 BOM (Windows editors add one) so the first key isn't "\uFEFFPORT".
  const lines = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadDotEnv(path.join(BACKEND_DIR, ".env"));

const nodeEnv = process.env.NODE_ENV || "development";
const jwtSecret = process.env.JWT_SECRET || "dev-secret-do-not-use-in-prod";

// Never let a placeholder secret reach production: anyone could forge tokens.
const PLACEHOLDER_SECRETS = ["dev-secret-do-not-use-in-prod", "change-this-in-production-please"];
if (nodeEnv === "production" && PLACEHOLDER_SECRETS.includes(jwtSecret)) {
  throw new Error("JWT_SECRET must be set to a strong, unique value when NODE_ENV=production.");
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  nodeEnv,
  // path.resolve (not path.join) so an absolute DB_PATH is respected.
  dbPath: path.resolve(BACKEND_DIR, process.env.DB_PATH || "../database/lumen.db"),
  schemaDir: path.join(ROOT_DIR, "database"),
  frontendDir: path.join(ROOT_DIR, "frontend"),
  jwtSecret,
  jwtExpiresIn: Number(process.env.JWT_EXPIRES_IN) || 60 * 60 * 24 * 7,
  corsOrigin: process.env.CORS_ORIGIN || "*"
};
