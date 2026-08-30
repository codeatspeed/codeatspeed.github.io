import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Document } from "../../src/domain/document";
import type { ReaderPosition } from "../../src/domain/reader-state";
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from "../../src/domain/settings";

const DATABASE_NAME = "speed-reader";

const document: Document = {
  id: "book-1",
  title: "A Small Book",
  author: "Reader",
  sections: [
    {
      id: "section-1",
      paragraphs: [
        {
          sentences: [
            {
              tokens: [
                {
                  text: "Hello",
                  kind: "word",
                  graphemes: ["H", "e", "l", "l", "o"],
                  pivotIndex: 2,
                  boundaryAfter: "none",
                  punctuationAfter: "",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const position: ReaderPosition = {
  documentId: document.id,
  sectionIndex: 0,
  sentenceIndex: 0,
  tokenIndex: 0,
};

const customSettings: ReaderSettings = {
  ...DEFAULT_READER_SETTINGS,
  wpm: 700,
  contrast: "high",
  reducedMotion: true,
};

const deleteDatabase = () =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DATABASE_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("database deletion was blocked"));
  });

describe("reader persistence", () => {
  beforeEach(async () => {
    vi.resetModules();
    await deleteDatabase();
  });

  it("round-trips documents and positions, overwrites positions, stores settings and last-opened metadata, and reads missing records as undefined", async () => {
    const {
      getDocument,
      getLastOpenedDocumentId,
      getPosition,
      getSettings,
      saveDocument,
      saveLastOpenedDocumentId,
      savePosition,
      saveSettings,
    } = await import("../../src/lib/persistence/database");

    await expect(getSettings()).resolves.toEqual(DEFAULT_READER_SETTINGS);
    await expect(getDocument("missing")).resolves.toBeUndefined();
    await expect(getPosition("missing")).resolves.toBeUndefined();
    await expect(getLastOpenedDocumentId()).resolves.toBeUndefined();

    await saveDocument(document);
    expect(await getDocument(document.id)).toEqual(document);

    await savePosition(position);
    expect(await getPosition(document.id)).toEqual(position);

    const overwrittenPosition = { ...position, tokenIndex: 1 };
    await savePosition(overwrittenPosition);
    expect(await getPosition(document.id)).toEqual(overwrittenPosition);

    await saveSettings(customSettings);
    expect(await getSettings()).toEqual(customSettings);

    await saveLastOpenedDocumentId(document.id);
    expect(await getLastOpenedDocumentId()).toBe(document.id);
  });

  it("reports storage failures and keeps the newest position authoritative in memory", async () => {
    const {
      StorageUnavailableError,
      getPosition,
      savePosition,
    } = await import("../../src/lib/persistence/database");

    await savePosition(position);
    const newestPosition = { ...position, tokenIndex: 99 };
    const open = vi.spyOn(globalThis.indexedDB, "open").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });

    await expect(savePosition(newestPosition)).rejects.toBeInstanceOf(StorageUnavailableError);
    await expect(getPosition(document.id)).resolves.toEqual(newestPosition);

    open.mockRestore();
  });
});
