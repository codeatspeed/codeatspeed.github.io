import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../../src/app/App";
import { navigate, parseRoute } from "../../src/app/router";
import { ErrorNotice } from "../../src/components/ErrorNotice";
import { importEpubFile, importPastedText } from "../../src/features/import/import-controller";
import { MAX_EPUB_BYTES } from "../../src/lib/epub/epub-parser";
import * as persistence from "../../src/lib/persistence/database";
import { validEpub3 } from "../fixtures/epub-fixtures";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = "#/";
});

describe("hash router", () => {
  it("parses home and encoded reader routes and rejects malformed encodings", () => {
    expect(parseRoute("#/")).toEqual({ ok: true, route: { name: "home" } });
    expect(parseRoute("#/read/book%2Fone")).toEqual({ ok: true, route: { name: "read", documentId: "book/one" } });
    expect(parseRoute("#/read/%E0%A4%A")).toEqual({ ok: false, error: "invalid-route" });
    expect(parseRoute("#/unknown")).toEqual({ ok: false, error: "invalid-route" });
  });

  it("navigates with an encoded document id", () => {
    navigate({ name: "read", documentId: "book/one" });
    expect(window.location.hash).toBe("#/read/book%2Fone");
  });
});

describe("import orchestration", () => {
  it("normalizes pasted text and returns a usable document", async () => {
    const result = await importPastedText("A pasted chapter with words.");
    expect(result.document.title).toBe("Untitled");
    expect(result.document.sections[0]?.paragraphs[0]?.sentences[0]?.tokens.some((token) => token.kind === "word")).toBe(true);
  });

  it("rejects an empty paste without exposing a parser exception", async () => {
    await expect(importPastedText("   ")).rejects.toThrow("Paste some text");
    await expect(importPastedText("   ")).rejects.not.toThrow("Text must contain at least one word");
  });

  it("rejects unsupported files and checks the size before reading", async () => {
    const unsupported = new File(["not epub"], "notes.txt", { type: "text/plain" });
    await expect(importEpubFile(unsupported)).rejects.toThrow("Choose an EPUB file");

    const oversized = new File([""], "large.epub", { type: "application/epub+zip" });
    Object.defineProperty(oversized, "size", { value: MAX_EPUB_BYTES + 1 });
    const arrayBuffer = vi.spyOn(oversized, "arrayBuffer");
    await expect(importEpubFile(oversized)).rejects.toThrow("50 MiB");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });
  it("imports a valid EPUB file", async () => {
    const file = new File([validEpub3()], "fixture.epub", { type: "application/epub+zip" });
    const result = await importEpubFile(file);
    expect(result.document.title).toBe("Fixture Book");
    expect(result.document.sections.length).toBe(2);
  });

  it("maps malformed EPUBs to a safe user message", async () => {
    const malformed = new File([new Uint8Array([1, 2, 3])], "broken.epub", { type: "application/epub+zip" });
    await expect(importEpubFile(malformed)).rejects.toThrow("couldn't read that EPUB");
    await expect(importEpubFile(malformed)).rejects.not.toThrow("invalidZip");
  });

  it("returns a storage notice while keeping the imported document usable", async () => {
    vi.spyOn(persistence, "saveDocument").mockRejectedValue(new persistence.StorageUnavailableError());
    vi.spyOn(persistence, "saveLastOpenedDocumentId").mockRejectedValue(new persistence.StorageUnavailableError());

    const result = await importPastedText("A chapter remains available in memory.");
    expect(result.document.sections.length).toBeGreaterThan(0);
    expect(result.notice).toEqual({
      kind: "storage-unavailable",
      message: "This book is available for this session, but your progress could not be saved locally.",
    });
  });
});

describe("import landing page", () => {
  beforeEach(() => {
    window.location.hash = "#/";
  });

  it("shows the picker, paste action, sample, privacy copy, help, and accessible status", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /make space for the next word/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/epub file/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/paste/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /import pasted text/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try a sample/i })).toBeInTheDocument();
    expect(screen.getByText(/stays on this device/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /help/i })).toHaveAttribute("href", "#help");
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("preserves empty paste input while showing an accessible error", async () => {
    const user = userEvent.setup();
    render(<App />);
    const paste = screen.getByLabelText(/paste/i);
    await user.type(paste, "   ");
    await user.click(screen.getByRole("button", { name: /import pasted text/i }));
    expect(paste).toHaveValue("   ");
    expect(await screen.findByRole("alert")).toHaveTextContent(/paste some text/i);
  });

  it("shows unsupported file and malformed EPUB errors without raw exception text", async () => {
    render(<App />);
    const picker = screen.getByLabelText(/epub file/i);
    const unsupported = new File(["bad"], "notes.txt", { type: "text/plain" });
    fireEvent.change(picker, { target: { files: [unsupported] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/choose an epub file/i);
    expect(screen.queryByText(/invalidZip/i)).not.toBeInTheDocument();

    const malformed = new File([new Uint8Array([1, 2, 3])], "broken.epub", { type: "application/epub+zip" });
    fireEvent.change(picker, { target: { files: [malformed] } });
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't read that epub/i);
  });

  it("activates the drop zone from the keyboard", async () => {
    const user = userEvent.setup();
    render(<App />);
    const dropZone = screen.getByRole("button", { name: /drop an epub/i });
    const picker = screen.getByLabelText(/epub file/i);
    const click = vi.spyOn(picker, "click");
    fireEvent.keyDown(dropZone, { key: "Enter" });
    fireEvent.keyDown(dropZone, { key: " " });
    expect(click).toHaveBeenCalledTimes(2);
    await user.tab();
  });

  it("navigates to the reader and hands off a non-blocking storage notice", async () => {
    vi.spyOn(persistence, "saveDocument").mockRejectedValue(new persistence.StorageUnavailableError());
    vi.spyOn(persistence, "saveLastOpenedDocumentId").mockRejectedValue(new persistence.StorageUnavailableError());
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/paste/i), "A session-only chapter.");
    await user.click(screen.getByRole("button", { name: /import pasted text/i }));
    expect(await screen.findByRole("heading", { name: /untitled|reader/i })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/could not be saved locally/i);
    expect(screen.getByRole("button", { name: /dismiss/i })).toBeInTheDocument();
  });
});

describe("ErrorNotice", () => {
  it("renders a dismissible alert", async () => {
    const onDismiss = vi.fn();
    const user = userEvent.setup();
    render(<ErrorNotice message="A recoverable notice" onDismiss={onDismiss} />);
    expect(screen.getByRole("alert")).toHaveTextContent("A recoverable notice");
    await user.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });
});
