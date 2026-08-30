import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Document, Token } from "../../src/domain/document";
import { DEFAULT_READER_SETTINGS } from "../../src/domain/settings";
import { ReaderPage } from "../../src/features/reader/ReaderPage";
import { StorageUnavailableError } from "../../src/lib/persistence/database";
import * as persistence from "../../src/lib/persistence/database";

function word(text: string, pivotIndex = Math.floor(text.length / 2)): Token {
  return {
    text,
    kind: "word",
    graphemes: [...text],
    pivotIndex,
    boundaryAfter: "none",
    punctuationAfter: "",
  };
}

function documentFixture(): Document {
  return {
    id: "reader-test",
    title: "A Test Chapter",
    author: "Reader",
    sections: [
      {
        id: "chapter-1",
        paragraphs: [{ sentences: [{ tokens: [word("alpha", 2), word("bravo", 2), word("charlie", 3)] }] }],
      },
    ],
  };
}
beforeEach(() => {
  vi.spyOn(persistence, "savePosition").mockResolvedValue(undefined);
  vi.spyOn(persistence, "saveSettings").mockResolvedValue(undefined);
});


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", window.location.href);
});

describe("reader surface", () => {
  it("defaults to focus mode and renders the exact pivot grapheme separately", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);

    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());

    expect(screen.getByTestId("reader-focus-word")).toBeInTheDocument();
    expect(screen.getByTestId("reader-pivot")).toHaveTextContent("p");
    expect(screen.getByRole("img", { name: "alpha" })).toBeInTheDocument();
    expect(screen.queryByTestId("reader-context")).not.toBeInTheDocument();
  });

  it("restores persisted context mode and supports context peek", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue({ ...DEFAULT_READER_SETTINGS, showContextByDefault: true });
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);

    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect(screen.getByTestId("reader-context")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Focus" }));
    expect(screen.queryByTestId("reader-context")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Context" })).toBeInTheDocument();
  });

  it("supports playback controls, WPM, progress, and manual stepping", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);

    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    const progress = screen.getByRole("progressbar");
    expect(progress).toHaveAttribute("aria-valuenow", "0");

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("bravo");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    expect(screen.getByText(/Paused: bravo/i)).toBeInTheDocument();

    const wpm = screen.getByRole("spinbutton", { name: /words per minute/i });
    await userEvent.clear(wpm);
    await userEvent.type(wpm, "600");
    expect(wpm).toHaveValue(600);
  });

  it("restores a valid position and recovers invalid persisted positions", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue({
      documentId: "reader-test",
      sectionIndex: 0,
      sentenceIndex: 0,
      tokenIndex: 2,
    });

    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("charlie");

    cleanup();
    vi.restoreAllMocks();
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue({
      documentId: "wrong",
      sectionIndex: 99,
      sentenceIndex: 99,
      tokenIndex: 99,
    });
    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("alpha");
  });

  it("opens expanded mode and closes it first on Escape", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);
    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /expand/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("falls back to defaults after storage reads fail and keeps a dismissible notice", async () => {
    vi.spyOn(persistence, "getSettings").mockRejectedValue(new StorageUnavailableError("settings unavailable"));
    vi.spyOn(persistence, "getPosition").mockRejectedValue(new StorageUnavailableError("position unavailable"));
    render(<ReaderPage document={documentFixture()} initialNotice={{ kind: "storage-unavailable", message: "import unavailable" }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect(screen.getByText("import unavailable")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Dismiss notice" }));
    expect(screen.queryByText("import unavailable")).not.toBeInTheDocument();
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("alpha");
  });

  it("handles keyboard controls and retains the final active word for previous/restart", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);
    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Pause" }));
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("bravo");
    fireEvent.keyDown(document, { key: "ArrowUp" });
    expect(screen.getByRole("spinbutton", { name: /words per minute/i })).toHaveValue(1050);
    fireEvent.keyDown(document, { key: "c" });
    expect(screen.getByTestId("reader-context")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("charlie");
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Resume" }));
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    expect(screen.getByTestId("reader-active-word")).toHaveTextContent("bravo");
  });
  it("renders only one active word when context falls back to long-word hold", async () => {
    vi.spyOn(persistence, "getSettings").mockResolvedValue({ ...DEFAULT_READER_SETTINGS, showContextByDefault: true });
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);
    const longDocument = documentFixture();
    longDocument.sections[0]!.paragraphs[0]!.sentences[0]!.tokens = [word("supercalifragilisticexpialidocious".repeat(30), 2)];
    render(<ReaderPage document={longDocument} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    expect(screen.getAllByTestId("reader-active-word")).toHaveLength(1);
  });
  it("persists changed reader settings and surfaces write failures", async () => {
    const saveSettings = vi.spyOn(persistence, "saveSettings");
    vi.spyOn(persistence, "getSettings").mockResolvedValue(DEFAULT_READER_SETTINGS);
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);
    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Pause" })).toBeInTheDocument());
    fireEvent.change(screen.getByRole("spinbutton", { name: /words per minute/i }), { target: { value: "700" } });
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ wpm: 700 })));
    cleanup();
    saveSettings.mockResolvedValue(undefined);
    vi.spyOn(persistence, "getSettings").mockResolvedValue({ ...DEFAULT_READER_SETTINGS, wpm: 700 });
    vi.spyOn(persistence, "getPosition").mockResolvedValue(undefined);
    render(<ReaderPage document={documentFixture()} />);
    await waitFor(() => expect(screen.getByRole("spinbutton", { name: /words per minute/i })).toHaveValue(700));
    saveSettings.mockRejectedValueOnce(new StorageUnavailableError("settings write unavailable"));
    fireEvent.change(screen.getByRole("spinbutton", { name: /words per minute/i }), { target: { value: "800" } });
    await waitFor(() => expect(screen.getByText("settings write unavailable")).toBeInTheDocument());
  });
});
