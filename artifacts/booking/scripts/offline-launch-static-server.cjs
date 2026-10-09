// Serves the locally built app (not production): files as they are, the app page for any staff-screen route.
const http = require("http"), fs = require("fs"), path = require("path");
const root = process.argv[2];
const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  if (p.startsWith("/api/")) { res.writeHead(401, { "Content-Type": "application/json" }); return res.end('{"message":"Unauthorized"}'); }
  const file = path.join(root, p);
  const send = (f, code = 200) => { res.writeHead(code, { "Content-Type": types[path.extname(f)] || "application/octet-stream", ...(f.endsWith("sw.js") ? { "Cache-Control": "no-cache" } : {}) }); fs.createReadStream(f).pipe(res); };
  if (p !== "/" && fs.existsSync(file) && fs.statSync(file).isFile()) return send(file);
  if (path.extname(p)) { res.writeHead(404); return res.end("not found"); }
  send(path.join(root, "index.html"));
}).listen(47813, "127.0.0.1");
