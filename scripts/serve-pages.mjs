import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

const rootDirectory = path.resolve(process.argv[2] ?? "dist");
const port = Number(process.argv[3] ?? 4173);
const configuredBasePath = process.env.PAGES_BASE_PATH ?? "/";
const basePath = configuredBasePath === "/"
  ? "/"
  : `/${configuredBasePath.replace(/^\/+|\/+$/gu, "")}/`;

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
  [".gif", "image/gif"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "content-length": Buffer.byteLength(message),
  });
  response.end(response.req.method === "HEAD" ? undefined : message);
}

function isWithinRoot(candidate) {
  const relative = path.relative(rootDirectory, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function stripBasePath(urlPath) {
  if (basePath === "/") return urlPath;
  if (urlPath === basePath.slice(0, -1)) return "/";
  return urlPath.startsWith(basePath) ? urlPath.slice(basePath.length - 1) : urlPath;
}

function isDocumentRequest(request, urlPath) {
  const acceptsHtml = (request.headers.accept ?? "").split(",").some((value) => value.trim().split(";", 1)[0] === "text/html");
  const finalSegment = urlPath.split("/").at(-1) ?? "";
  return (urlPath === "/" || acceptsHtml) && (urlPath.endsWith("/") || !finalSegment.includes("."));
}

async function resolveFile(request, requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return { status: 400, message: "Bad request" };
  }
  if (decodedPath.includes("\\") || decodedPath.split("/").some((segment) => segment === "..")) {
    return { status: 403, message: "Forbidden" };
  }

  const relativePath = decodedPath.replace(/^\/+/u, "");
  const requestedFile = path.resolve(rootDirectory, relativePath);
  if (!isWithinRoot(requestedFile)) return { status: 403, message: "Forbidden" };

  try {
    const stats = await fs.stat(requestedFile);
    if (stats.isFile()) return { filePath: requestedFile, contentType: MIME_TYPES.get(path.extname(requestedFile).toLowerCase()) ?? "application/octet-stream" };
    if (!stats.isDirectory()) return { status: 404, message: "Not found" };
  } catch (error) {
    if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
  }

  if (isDocumentRequest(request, decodedPath)) {
    const indexPath = path.join(rootDirectory, "index.html");
    try {
      const stats = await fs.stat(indexPath);
      if (stats.isFile()) return { filePath: indexPath, contentType: "text/html; charset=utf-8" };
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") throw error;
    }
  }
  return { status: 404, message: "Not found" };
}

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method not allowed");
    return;
  }

  const requestTarget = request.url ?? "/";
  const queryIndex = requestTarget.search(/[?#]/u);
  const rawPath = queryIndex === -1 ? requestTarget : requestTarget.slice(0, queryIndex);
  if (!rawPath.startsWith("/")) {
    sendText(response, 400, "Bad request");
    return;
  }

  try {
    const result = await resolveFile(request, stripBasePath(rawPath));
    if ("status" in result) {
      sendText(response, result.status, result.message);
      return;
    }
    const stats = await fs.stat(result.filePath);
    response.writeHead(200, {
      "content-type": result.contentType,
      "content-length": stats.size,
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    createReadStream(result.filePath).pipe(response);
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendText(response, 500, "Internal server error");
    else response.destroy(error);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Pages preview serving ${rootDirectory} at http://127.0.0.1:${port}${basePath}`);
});

process.once("SIGINT", () => server.close(() => process.exit(0)));
process.once("SIGTERM", () => server.close(() => process.exit(0)));
