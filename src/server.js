// HTTP server: serves the REST API under /api and the frontend from /public.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const { openDatabase, createTaskRepository } = require("./db");
const { createHandlers } = require("./tasks");
const { HttpError } = require("./errors");

const PUBLIC_DIR = path.join(__dirname, "..", "public");
const MAX_BODY_BYTES = 10 * 1024; // 10 KB is plenty for a task

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

function sendJson(res, status, body) {
  if (status === 204) {
    res.writeHead(204).end();
    return;
  }
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, "Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("not an object");
        }
        resolve(parsed);
      } catch {
        reject(new HttpError(400, "Request body must be a valid JSON object."));
      }
    });
    req.on("error", reject);
  });
}

function createApp(db = openDatabase()) {
  const h = createHandlers(createTaskRepository(db));

  // [method, path pattern, handler]
  const routes = [
    ["GET", /^\/api\/tasks\/?$/, h.list],
    ["POST", /^\/api\/tasks\/?$/, h.create],
    ["GET", /^\/api\/tasks\/([^/]+)\/?$/, h.get],
    ["PUT", /^\/api\/tasks\/([^/]+)\/?$/, h.update],
    ["PATCH", /^\/api\/tasks\/([^/]+)\/toggle\/?$/, h.toggle],
    ["DELETE", /^\/api\/tasks\/([^/]+)\/?$/, h.remove],
  ];

  async function handleApi(req, res, url) {
    const matches = routes.filter(([, pattern]) => pattern.test(url.pathname));
    if (!matches.length) throw new HttpError(404, `No such endpoint: ${url.pathname}`);

    const route = matches.find(([method]) => method === req.method);
    if (!route) {
      throw new HttpError(405, `Method ${req.method} not allowed on ${url.pathname}.`);
    }

    const [, pattern, handler] = route;
    const params = { id: url.pathname.match(pattern)[1] };
    const body = ["POST", "PUT"].includes(req.method) ? await readJsonBody(req) : {};
    const result = handler({ params, query: url.searchParams, body });
    sendJson(res, result.status, result.body);
  }

  function serveStatic(req, res, url) {
    if (!["GET", "HEAD"].includes(req.method)) throw new HttpError(405, "Method not allowed.");

    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const file = path.normalize(path.join(PUBLIC_DIR, requested));
    if (!file.startsWith(PUBLIC_DIR)) throw new HttpError(403, "Forbidden."); // block ../ tricks

    fs.readFile(file, (err, data) => {
      if (err) return sendJson(res, 404, { error: { message: "Not found." } });
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
      res.end(req.method === "HEAD" ? undefined : data);
    });
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
      else serveStatic(req, res, url);
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: { message: err.message } });
      } else {
        console.error(err);
        sendJson(res, 500, { error: { message: "Something went wrong on the server." } });
      }
    }
  });
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Task List running at http://localhost:${port}`));
}

module.exports = { createApp };
