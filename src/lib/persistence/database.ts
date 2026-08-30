import { openDB, type IDBPDatabase } from "idb";

import type { Document } from "../../domain/document";
import type { ReaderPosition } from "../../domain/reader-state";
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from "../../domain/settings";

const DATABASE_NAME = "speed-reader";
const DATABASE_VERSION = 1;
const SETTINGS_KEY = "settings" as const;
const LAST_OPENED_KEY = "last-opened" as const;

export type ReaderDatabase = {
  documents: { key: string; value: Document };
  positions: { key: string; value: ReaderPosition };
  settings: { key: typeof SETTINGS_KEY; value: ReaderSettings };
  metadata: { key: typeof LAST_OPENED_KEY; value: string };
};

export class StorageUnavailableError extends Error {
  constructor(message = "Reader storage is unavailable", options?: ErrorOptions) {
    super(message, options);
    this.name = "StorageUnavailableError";
  }
}

const documentCache = new Map<string, Document>();
const positionCache = new Map<string, ReaderPosition>();
let settingsCache: ReaderSettings | undefined;
let lastOpenedDocumentIdCache: string | undefined;

const asStorageUnavailableError = (error: unknown): StorageUnavailableError => {
  if (error instanceof StorageUnavailableError) {
    return error;
  }

  const message = error instanceof Error && error.message ? error.message : undefined;
  return new StorageUnavailableError(message, { cause: error });
};

export const openReaderDatabase = async (): Promise<IDBPDatabase<ReaderDatabase>> => {
  try {
    return await openDB<ReaderDatabase>(DATABASE_NAME, DATABASE_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("documents")) {
          database.createObjectStore("documents");
        }
        if (!database.objectStoreNames.contains("positions")) {
          database.createObjectStore("positions");
        }
        if (!database.objectStoreNames.contains("settings")) {
          database.createObjectStore("settings");
        }
        if (!database.objectStoreNames.contains("metadata")) {
          database.createObjectStore("metadata");
        }
      },
    });
  } catch (error) {
    throw asStorageUnavailableError(error);
  }
};

const getRecord = async <StoreName extends keyof ReaderDatabase>(
  storeName: StoreName,
  key: ReaderDatabase[StoreName]["key"],
): Promise<ReaderDatabase[StoreName]["value"] | undefined> => {
  let database: IDBPDatabase<ReaderDatabase> | undefined;
  try {
    database = await openReaderDatabase();
    return await database.get(storeName, key);
  } catch (error) {
    throw asStorageUnavailableError(error);
  } finally {
    database?.close();
  }
};

const putRecord = async <StoreName extends keyof ReaderDatabase>(
  storeName: StoreName,
  key: ReaderDatabase[StoreName]["key"],
  value: ReaderDatabase[StoreName]["value"],
): Promise<void> => {
  let database: IDBPDatabase<ReaderDatabase> | undefined;
  try {
    database = await openReaderDatabase();
    await database.put(storeName, value, key);
  } catch (error) {
    throw asStorageUnavailableError(error);
  } finally {
    database?.close();
  }
};

export const saveDocument = async (document: Document): Promise<void> => {
  documentCache.set(document.id, document);
  await putRecord("documents", document.id, document);
};

export const getDocument = async (id: string): Promise<Document | undefined> => {
  const cached = documentCache.get(id);
  if (cached !== undefined) {
    return cached;
  }

  const document = await getRecord("documents", id);
  if (document !== undefined) {
    documentCache.set(id, document);
  }
  return document;
};

export const savePosition = async (position: ReaderPosition): Promise<void> => {
  positionCache.set(position.documentId, position);
  await putRecord("positions", position.documentId, position);
};

export const getPosition = async (documentId: string): Promise<ReaderPosition | undefined> => {
  const cached = positionCache.get(documentId);
  if (cached !== undefined) {
    return cached;
  }

  const position = await getRecord("positions", documentId);
  if (position !== undefined) {
    positionCache.set(documentId, position);
  }
  return position;
};

export const saveSettings = async (settings: ReaderSettings): Promise<void> => {
  settingsCache = settings;
  await putRecord("settings", SETTINGS_KEY, settings);
};

export const getSettings = async (): Promise<ReaderSettings> => {
  if (settingsCache !== undefined) {
    return settingsCache;
  }

  const settings = await getRecord("settings", SETTINGS_KEY);
  settingsCache = settings ?? DEFAULT_READER_SETTINGS;
  return settingsCache;
};

export const saveLastOpenedDocumentId = async (documentId: string): Promise<void> => {
  lastOpenedDocumentIdCache = documentId;
  await putRecord("metadata", LAST_OPENED_KEY, documentId);
};

export const getLastOpenedDocumentId = async (): Promise<string | undefined> => {
  if (lastOpenedDocumentIdCache !== undefined) {
    return lastOpenedDocumentIdCache;
  }

  const documentId = await getRecord("metadata", LAST_OPENED_KEY);
  if (documentId !== undefined) {
    lastOpenedDocumentIdCache = documentId;
  }
  return documentId;
};
