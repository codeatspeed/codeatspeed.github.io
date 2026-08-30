import { readFile } from "node:fs/promises";

const expected = process.env.VITE_BASE_PATH ?? "/";
const html = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
const canonical = html.match(/<link rel="canonical" href="([^"]+)"\s*\/>/)?.[1];

if (canonical !== expected) {
  throw new Error(`Expected canonical href ${JSON.stringify(expected)}, received ${JSON.stringify(canonical)}`);
}

console.log(`canonical=${canonical}`);
