import { Unzip, UnzipInflate } from "fflate";

import type { Document, Paragraph, Section } from "../../domain/document";
import { normalizeText } from "../text/normalize";
import { extractXhtmlText, type ExtractedXhtmlText } from "./xhtml-text";

export { extractXhtmlText } from "./xhtml-text";

export const MAX_EPUB_BYTES = 50 * 1024 * 1024;
export const MAX_ENTRY_BYTES = 20 * 1024 * 1024;
export const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

export type EpubImportErrorCode =
  | "invalidZip"
  | "tooLarge"
  | "missingContainer"
  | "invalidPackage"
  | "emptySpine"
  | "noReadableText";

export class EpubImportError extends Error {
  readonly code: EpubImportErrorCode;

  constructor(code: EpubImportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "EpubImportError";
    this.code = code;
  }
}

function importError(code: EpubImportErrorCode, message: string, cause?: unknown): EpubImportError {
  return new EpubImportError(code, message, cause === undefined ? undefined : { cause });
}

function localName(element: Element): string {
  return (element.localName || element.tagName).toLowerCase();
}

function elementsNamed(root: ParentNode, name: string): Element[] {
  return Array.from(root.querySelectorAll("*"))
    .filter((element) => localName(element) === name)
    .map((element) => element as Element);
}

function parseXml(source: string, description: string): XMLDocument {
  let document: XMLDocument;
  try {
    document = new DOMParser().parseFromString(source, "application/xml");
  } catch (error) {
    throw importError("invalidPackage", `${description} could not be parsed`, error);
  }
  const root = document.documentElement;
  const parserError = root === null || localName(root) === "parsererror" || elementsNamed(document, "parsererror").length > 0;
  if (parserError) throw importError("invalidPackage", `${description} contains XML parser errors`);
  return document;
}

function decodePath(path: string, description: string): string {
  try {
    return decodeURIComponent(path);
  } catch (error) {
    throw importError("invalidPackage", `${description} contains an invalid percent escape`, error);
  }
}

function resolveArchivePath(baseDirectory: string, href: string, description: string): string {
  const withoutFragment = href.split("#", 1)[0] ?? "";
  const decoded = decodePath(withoutFragment, description);
  if (decoded.length === 0 || decoded.startsWith("/") || decoded.includes("\\") || /^[a-z][a-z\d+.-]*:/iu.test(decoded)) {
    throw importError("invalidPackage", `${description} is not a safe archive path`);
  }

  const segments = [...(baseDirectory.length === 0 ? [] : baseDirectory.split("/")), ...decoded.split("/")];
  const normalized: string[] = [];
  for (const segment of segments) {
    if (segment.length === 0 || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length === 0) throw importError("invalidPackage", `${description} escapes the archive root`);
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  if (normalized.length === 0) throw importError("invalidPackage", `${description} is empty`);
  return normalized.join("/");
}

function directoryOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function hasValidEndOfCentralDirectory(bytes: Uint8Array): boolean {
  const minimumOffset = Math.max(0, bytes.length - 22 - 0xffff);
  for (let offset = bytes.length - 22; offset >= minimumOffset; offset -= 1) {
    if (
      bytes[offset] !== 0x50 ||
      bytes[offset + 1] !== 0x4b ||
      bytes[offset + 2] !== 0x05 ||
      bytes[offset + 3] !== 0x06
    ) {
      continue;
    }
    const commentLength = (bytes[offset + 20] ?? 0) | ((bytes[offset + 21] ?? 0) << 8);
    if (offset + 22 + commentLength !== bytes.length) continue;
    const centralDirectorySize =
      ((bytes[offset + 12] ?? 0) |
        ((bytes[offset + 13] ?? 0) << 8) |
        ((bytes[offset + 14] ?? 0) << 16) |
        ((bytes[offset + 15] ?? 0) << 24)) >>>
      0;
    const centralDirectoryOffset =
      ((bytes[offset + 16] ?? 0) |
        ((bytes[offset + 17] ?? 0) << 8) |
        ((bytes[offset + 18] ?? 0) << 16) |
        ((bytes[offset + 19] ?? 0) << 24)) >>>
      0;
    if (
      centralDirectorySize === 0 ||
      centralDirectorySize === 0xffffffff ||
      centralDirectoryOffset === 0xffffffff ||
      centralDirectoryOffset + centralDirectorySize > offset ||
      centralDirectoryOffset + 4 > offset ||
      bytes[centralDirectoryOffset] !== 0x50 ||
      bytes[centralDirectoryOffset + 1] !== 0x4b ||
      bytes[centralDirectoryOffset + 2] !== 0x01 ||
      bytes[centralDirectoryOffset + 3] !== 0x02
    ) {
      continue;
    }
    return true;
  }
  return false;
}

function readArchive(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.byteLength < 4 ||
    bytes[0] !== 0x50 ||
    bytes[1] !== 0x4b ||
    !([0x03, 0x05, 0x07] as number[]).includes(bytes[2] ?? -1)
  ) {
    throw importError("invalidZip", "The input is not a ZIP archive");
  }
  if (!hasValidEndOfCentralDirectory(bytes)) {
    throw importError("invalidZip", "ZIP archive has no valid end-of-central-directory record");
  }

  const entries = new Map<string, Uint8Array>();
  let totalBytes = 0;
  let entryCount = 0;
  const unzip = new Unzip((file) => {
    entryCount += 1;
    if ((file.originalSize ?? 0) > MAX_ENTRY_BYTES || totalBytes + (file.originalSize ?? 0) > MAX_ARCHIVE_BYTES) {
      throw importError("tooLarge", "The decompressed EPUB exceeds its safety limit");
    }

    const chunks: Uint8Array[] = [];
    let entryBytes = 0;
    file.ondata = (error, chunk, final) => {
      if (error !== null) throw importError("invalidZip", "ZIP entry decompression failed", error);
      entryBytes += chunk.byteLength;
      totalBytes += chunk.byteLength;
      if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_ARCHIVE_BYTES) {
        throw importError("tooLarge", "The decompressed EPUB exceeds its safety limit");
      }
      chunks.push(chunk);
      if (final) entries.set(file.name, concatChunks(chunks, entryBytes));
    };
    try {
      file.start();
    } catch (error) {
      if (error instanceof EpubImportError) throw error;
      throw importError("invalidZip", "ZIP entry could not be decompressed", error);
    }
  });
  unzip.register(UnzipInflate);

  try {
    const chunkSize = 64 * 1024;
    for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
      unzip.push(bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)), offset + chunkSize >= bytes.byteLength);
    }
  } catch (error) {
    if (error instanceof EpubImportError) throw error;
    throw importError("invalidZip", "ZIP archive could not be read", error);
  }
  if (entryCount === 0 && bytes[2] === 0x03) throw importError("invalidZip", "ZIP archive has no complete entries");
  return entries;
}

function concatChunks(chunks: Uint8Array[], byteLength: number): Uint8Array {
  const output = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function decodeEntry(entries: Map<string, Uint8Array>, path: string, description: string): string {
  const bytes = entries.get(path);
  if (bytes === undefined) throw importError("invalidPackage", `${description} is missing`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw importError("invalidPackage", `${description} is not valid UTF-8`, error);
  }
}

function packageMetadata(document: XMLDocument): { title?: string; author?: string } {
  const metadata = elementsNamed(document, "metadata")[0];
  if (metadata === undefined) return {};
  const title = elementsNamed(metadata, "title")[0]?.textContent?.replace(/\s+/gu, " ").trim();
  const author = elementsNamed(metadata, "creator")[0]?.textContent?.replace(/\s+/gu, " ").trim();
  return {
    ...(title ? { title } : {}),
    ...(author ? { author } : {}),
  };
}

function readableMediaType(mediaType: string, href: string): boolean {
  return mediaType === "application/xhtml+xml" || mediaType === "text/html" || /\.(?:xhtml?|html?)$/iu.test(href);
}
function sectionForText(text: string, metadata: { title?: string; author?: string }): Paragraph[] {
  try {
    return normalizeText(text, metadata).sections[0]?.paragraphs ?? [];
  } catch (error) {
    if (error instanceof Error && error.message === "Text must contain at least one word") return [];
    throw error;
  }
}

function encryptedSpinePaths(
  entries: Map<string, Uint8Array>,
  packageDirectory: string,
): Set<string> {
  const encryptionBytes = entries.get("META-INF/encryption.xml");
  if (encryptionBytes === undefined) return new Set<string>();
  const encryption = parseXml(decodeEntry(entries, "META-INF/encryption.xml", "encryption.xml"), "encryption.xml");
  const encrypted = new Set<string>();
  for (const reference of elementsNamed(encryption, "cipherreference")) {
    const uri = reference.getAttribute("URI");
    if (uri === null || uri.length === 0) throw importError("invalidPackage", "Encryption reference is malformed");
    const rootPath = resolveArchivePath("", uri, "encryption reference");
    const packagePath = resolveArchivePath(packageDirectory, uri, "encryption reference");
    if (entries.has(rootPath)) encrypted.add(rootPath);
    if (entries.has(packagePath)) encrypted.add(packagePath);
  }
  return encrypted;
}

export async function parseEpub(buffer: ArrayBuffer): Promise<Document> {
  if (buffer.byteLength > MAX_EPUB_BYTES) throw importError("tooLarge", "The EPUB exceeds the 50 MiB input limit");

  const entries = readArchive(buffer);
  const containerPath = "META-INF/container.xml";
  const containerBytes = entries.get(containerPath);
  if (containerBytes === undefined) throw importError("missingContainer", "META-INF/container.xml is missing");
  const container = parseXml(decodeEntry(entries, containerPath, containerPath), "container.xml");
  const rootfile = elementsNamed(container, "rootfile")[0];
  const fullPath = rootfile?.getAttribute("full-path");
  if (rootfile === undefined || fullPath === null) throw importError("invalidPackage", "container.xml has no rootfile path");

  const packagePath = resolveArchivePath("", fullPath, "container rootfile");
  const packageDocument = parseXml(decodeEntry(entries, packagePath, "OPF package"), "OPF package");
  if (localName(packageDocument.documentElement) !== "package") throw importError("invalidPackage", "OPF root is not package");

  const manifest = new Map<string, { href: string; mediaType: string; encrypted: boolean }>();
  for (const item of elementsNamed(packageDocument, "item")) {
    const id = item.getAttribute("id");
    const href = item.getAttribute("href");
    if (id === null || href === null || id.length === 0 || href.length === 0) throw importError("invalidPackage", "Manifest item is malformed");
    const properties = item.getAttribute("properties")?.split(/\s+/u) ?? [];
    manifest.set(id, {
      href,
      mediaType: item.getAttribute("media-type") ?? "",
      encrypted: properties.includes("encrypted"),
    });
  }

  const spine = elementsNamed(packageDocument, "spine")[0];
  const itemrefs = spine === undefined ? [] : elementsNamed(spine, "itemref");
  if (itemrefs.length === 0) throw importError("emptySpine", "The OPF spine is empty");

  const metadata = packageMetadata(packageDocument);
  const sectionParagraphs: Paragraph[][] = [];
  let firstChapterTitle: string | undefined;
  const packageDirectory = directoryOf(packagePath);
  const encryptedPaths = encryptedSpinePaths(entries, packageDirectory);
  for (const itemref of itemrefs) {
    if ((itemref.getAttribute("linear") ?? "yes").toLowerCase() === "no") continue;
    const idref = itemref.getAttribute("idref");
    if (idref === null || idref.length === 0) throw importError("invalidPackage", "Spine itemref is malformed");
    const item = manifest.get(idref);
    if (item === undefined) throw importError("invalidPackage", `Spine itemref ${idref} has no manifest item`);
    if (!readableMediaType(item.mediaType.toLowerCase(), item.href)) continue;
    const contentPath = resolveArchivePath(packageDirectory, item.href, `manifest href ${item.href}`);
    if (item.encrypted || encryptedPaths.has(contentPath)) continue;
    let extracted: ExtractedXhtmlText;
    try {
      extracted = extractXhtmlText(decodeEntry(entries, contentPath, `spine item ${idref}`));
    } catch (error) {
      if (error instanceof EpubImportError) throw error;
      throw importError("invalidPackage", `Spine item ${idref} contains invalid XHTML`, error);
    }
    if (firstChapterTitle === undefined && extracted.title !== undefined) firstChapterTitle = extracted.title;
    const text = extracted.paragraphs.join("\n\n");
    const normalizedParagraphs = sectionForText(text, {
      title: metadata.title ?? firstChapterTitle,
      author: metadata.author,
    });
    sectionParagraphs.push(normalizedParagraphs);
  }

  if (!sectionParagraphs.some((paragraphs) => paragraphs.length > 0)) {
    throw importError("noReadableText", "The EPUB contains no readable word text");
  }
  const allText = sectionParagraphs
    .flatMap((paragraphs) => paragraphs.map((paragraph) => paragraph.sentences.flatMap((sentence) => sentence.tokens.map((token) => token.text)).join("")))
    .join("\n\n");
  const document = normalizeText(allText, {
    title: metadata.title ?? firstChapterTitle,
    author: metadata.author,
  });
  const sections: Section[] = sectionParagraphs.map((paragraphs, index) => ({ id: `${document.id}-section-${index}`, paragraphs }));
  return { ...document, sections };
}
