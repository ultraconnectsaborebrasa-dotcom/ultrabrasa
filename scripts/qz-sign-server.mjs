import { createServer } from "node:http";
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const host = "127.0.0.1";
const port = Number(process.env.QZ_SIGN_PORT || 8189);
const desktopCertDir = join(process.env.USERPROFILE || homedir(), "Desktop", "QZ Tray Demo Cert");
const certPath = resolve(process.env.QZ_CERT_PATH || join(desktopCertDir, "digital-certificate.txt"));
const keyPath = resolve(process.env.QZ_PRIVATE_KEY_PATH || join(desktopCertDir, "private-key.pem"));
const allowedOrigins = new Set([
  "http://localhost:3000", "http://127.0.0.1:3000",
  "http://localhost:5173", "http://127.0.0.1:5173",
  "http://localhost:4173", "http://127.0.0.1:4173",
]);
function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}
async function readBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 32_768) throw new Error("Request too large");
  }
  return body;
}
const server = createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return send(res, 403, "Origin not allowed");
  if (origin) { res.setHeader("Access-Control-Allow-Origin", origin); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  const path = new URL(req.url || "/", "http://127.0.0.1").pathname;
  try {
    if (path === "/health" && req.method === "GET") return send(res, 200, "QZ local signing server ready");
    if (!origin || !allowedOrigins.has(origin)) return send(res, 403, "A local Ultrabrasa development origin is required");
    if (path === "/certificate" && req.method === "GET") return send(res, 200, await readFile(certPath, "utf8"));
    if (path === "/sign" && req.method === "POST") {
      const payload = JSON.parse(await readBody(req));
      if (typeof payload.request !== "string" || !payload.request.length || payload.request.length > 24_000) return send(res, 400, "Invalid signing request");
      const privateKey = await readFile(keyPath, "utf8");
      const signer = createSign("RSA-SHA512");
      signer.update(payload.request, "utf8");
      signer.end();
      return send(res, 200, signer.sign(privateKey, "base64"));
    }
    return send(res, 404, "Not found");
  } catch (error) {
    console.error("[QZ local signing]", error instanceof Error ? error.message : error);
    return send(res, 500, "QZ local signing failed. Check local certificate/key paths and PEM format.");
  }
});
server.listen(port, host, () => {
  console.log(`QZ demo signing server listening at http://${host}:${port}`);
  console.log("Private key is read from disk and is never sent to the browser or committed.");
  console.log("If needed, set QZ_CERT_PATH and QZ_PRIVATE_KEY_PATH to the local demo files.");
});
server.on("error", error => { console.error("[QZ local signing]", error.message); process.exitCode = 1; });
