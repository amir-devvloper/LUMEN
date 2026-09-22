/**
 * Minimal HMAC-signed token (JWT-shaped: header.payload.signature),
 * so auth works without adding a jsonwebtoken dependency.
 */
const crypto = require("crypto");
const env = require("../config/env");

function b64url(input) {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input) {
  input = input.replace(/-/g, "+").replace(/_/g, "/");
  while (input.length % 4) input += "=";
  return Buffer.from(input, "base64").toString("utf8");
}

function sign(payload, expiresInSeconds = env.jwtExpiresIn) {
  const header = { alg: "HS256", typ: "LUMEN" };
  const body = { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSeconds };

  const headerPart = b64url(JSON.stringify(header));
  const bodyPart = b64url(JSON.stringify(body));
  const signature = crypto
    .createHmac("sha256", env.jwtSecret)
    .update(headerPart + "." + bodyPart)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  return headerPart + "." + bodyPart + "." + signature;
}

function verify(token) {
  if (!token || typeof token !== "string") throw new Error("Missing token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerPart, bodyPart, signature] = parts;

  const expected = crypto
    .createHmac("sha256", env.jwtSecret)
    .update(headerPart + "." + bodyPart)
    .digest("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid signature");

  const body = JSON.parse(b64urlDecode(bodyPart));
  if (body.exp && Math.floor(Date.now() / 1000) > body.exp) throw new Error("Token expired");
  return body;
}

module.exports = { sign, verify };
