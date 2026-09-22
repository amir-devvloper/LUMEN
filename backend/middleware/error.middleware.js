const env = require("../config/env");
const { ApiError } = require("../utils/helpers");

function notFound(req, res, next) {
  next(new ApiError(404, "Not found: " + req.method + " " + req.originalUrl));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err instanceof ApiError ? err.status : err.status || 500;
  if (status >= 500) console.error(err);

  const isProd = env.nodeEnv === "production";
  res.status(status).json({
    // Don't leak SQL / internal error text to clients in production.
    message: status >= 500 && isProd ? "Something went wrong" : err.message || "Something went wrong",
    ...(!isProd && status >= 500 ? { stack: err.stack } : {})
  });
}

module.exports = { notFound, errorHandler };
