import type { Document } from "../../domain/document";
import type { ReaderNotice } from "../../domain/reader-state";
import { parseEpub, EpubImportError, MAX_EPUB_BYTES } from "../../lib/epub/epub-parser";
import { normalizeText } from "../../lib/text/normalize";
import {
  saveDocument,
  saveLastOpenedDocumentId,
  StorageUnavailableError,
} from "../../lib/persistence/database";

export type ImportResult = { document: Document; notice?: ReaderNotice };

const STORAGE_NOTICE: ReaderNotice = {
  kind: "storage-unavailable",
  message: "This book is available for this session, but your progress could not be saved locally.",
};

export class ImportInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportInputError";
  }
}

async function persistImportedDocument(document: Document): Promise<ReaderNotice | undefined> {
  let storageUnavailable = false;
  try {
    await saveDocument(document);
  } catch (error) {
    if (error instanceof StorageUnavailableError) storageUnavailable = true;
    else throw error;
  }

  try {
    await saveLastOpenedDocumentId(document.id);
  } catch (error) {
    if (error instanceof StorageUnavailableError) storageUnavailable = true;
    else throw error;
  }

  return storageUnavailable ? STORAGE_NOTICE : undefined;
}

export async function importPastedText(text: string): Promise<ImportResult> {
  let document: Document;
  try {
    document = normalizeText(text);
  } catch {
    throw new ImportInputError("Paste some text with at least one word to begin reading.");
  }
  const notice = await persistImportedDocument(document);
  return notice === undefined ? { document } : { document, notice };
}

function isEpubFile(file: File): boolean {
  return /\.epub$/iu.test(file.name) || file.type.toLowerCase().endsWith("epub+zip");
}

function parserMessage(error: unknown): string {
  if (error instanceof EpubImportError) {
    if (error.code === "tooLarge") return "That EPUB is larger than the 50 MiB limit.";
    if (error.code === "noReadableText") return "That EPUB does not contain readable text.";
    return "We couldn't read that EPUB. Try a non-DRM, text-based EPUB.";
  }
  return "We couldn't read that EPUB. Try a non-DRM, text-based EPUB.";
}

export async function importEpubFile(file: File): Promise<ImportResult> {
  if (!isEpubFile(file)) {
    throw new ImportInputError("Choose an EPUB file to begin reading.");
  }
  if (file.size > MAX_EPUB_BYTES) {
    throw new ImportInputError("That EPUB is larger than the 50 MiB limit.");
  }

  let document: Document;
  try {
    const buffer = await file.arrayBuffer();
    document = await parseEpub(buffer);
  } catch (error) {
    throw new ImportInputError(parserMessage(error));
  }

  const notice = await persistImportedDocument(document);
  return notice === undefined ? { document } : { document, notice };
}
