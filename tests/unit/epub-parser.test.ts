import { describe, expect, it } from "vitest";

import type { Document } from "../../src/domain/document";
import { epubBuffer, validEpub3, EPUB2_OPF, CONTAINER_XML } from "../fixtures/epub-fixtures";
import {
  EpubImportError,
  extractXhtmlText,
  MAX_ARCHIVE_BYTES,
  MAX_ENTRY_BYTES,
  parseEpub,
} from "../../src/lib/epub/epub-parser";

const textOf = (document: Document) =>
  document.sections
    .flatMap((section) => section.paragraphs)
    .flatMap((paragraph) => paragraph.sentences)
    .flatMap((sentence) => sentence.tokens)
    .map((token) => token.text)
    .join("");


const expectCode = async (promise: Promise<unknown>, code: EpubImportError["code"]) => {
  await expect(promise).rejects.toMatchObject({ code });
};

describe("extractXhtmlText", () => {
  it("extracts title and block paragraphs without unsafe element text", () => {
    const result = extractXhtmlText(`
      <html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter title</title></head>
      <body><h1>Heading</h1><p>One <strong>paragraph</strong>.</p><div>Two</div>
      <script>do not include this</script><style>.hidden { color: red }</style>
      <noscript>fallback</noscript><svg><text>vector</text></svg><img alt="image words" /></body></html>
    `);

    expect(result.title).toBe("Chapter title");
    expect(result.paragraphs).toEqual(["One paragraph.", "Two"]);
    expect(result.paragraphs.join(" ")).not.toMatch(/do not|hidden|fallback|vector|image words/u);
  });

  it("uses a heading as metadata when no title element exists", () => {
    expect(extractXhtmlText("<html><body><h1>Heading title</h1><p>Body text.</p></body></html>")).toEqual({
      title: "Heading title",
      paragraphs: ["Body text."],
    });
  });
});

describe("parseEpub", () => {
  it("imports EPUB 3 metadata, safe XHTML, and sections in declared spine order", async () => {
    const document = await parseEpub(validEpub3());

    expect(document.title).toBe("Fixture Book");
    expect(document.author).toBe("Fixture Author");
    expect(document.sections).toHaveLength(2);
    expect(textOf(document)).toContain("First readable paragraph.");
    expect(textOf(document)).toContain("Third paragraph.");
    expect(textOf(document)).not.toMatch(/evil|svg words|style words/u);
    expect(document.sections.map((section) => section.id)).toEqual([
      `${document.id}-section-0`,
      `${document.id}-section-1`,
    ]);
  });

  it("supports EPUB 2 packages", async () => {
    const document = await parseEpub(
      epubBuffer({
        "META-INF/container.xml": CONTAINER_XML,
        "OEBPS/content.opf": EPUB2_OPF,
        "OEBPS/chapter.xhtml": "<html><body><p>EPUB two body.</p></body></html>",
      }),
    );

    expect(document.title).toBe("EPUB Two");
    expect(document.author).toBe("Author Two");
    expect(textOf(document)).toContain("EPUB two body.");
  });

  it("follows spine order rather than manifest order and resolves encoded nested hrefs", async () => {
    const opf = `<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Ordered</dc:title></metadata><manifest><item id="later" href="chapters/second%20chapter.xhtml" media-type="application/xhtml+xml"/><item id="first" href="chapters/first.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="later"/></spine></package>`;
    const document = await parseEpub(
      epubBuffer({
        "META-INF/container.xml": CONTAINER_XML,
        "OEBPS/content.opf": opf,
        "OEBPS/chapters/first.xhtml": "<html><body><p>First in spine.</p></body></html>",
        "OEBPS/chapters/second chapter.xhtml": "<html><body><p>Second in spine.</p></body></html>",
      }),
    );

    expect(document.sections.map((section) => section.paragraphs[0]?.sentences[0]?.tokens[0]?.text)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("requires a complete ZIP end-of-central-directory record", async () => {
    const source = new Uint8Array(validEpub3());
    const trailing = new Uint8Array(source.byteLength + 1);
    trailing.set(source);
    trailing[trailing.length - 1] = 0x7f;
    await expectCode(parseEpub(trailing.buffer), "invalidZip");
    const malformed = new Uint8Array(source);
    const endRecord = malformed.lastIndexOf(0x50);
    const endOffset = Array.from({ length: malformed.length - 3 }, (_, index) => malformed.length - 4 - index).find(
      (offset) => malformed[offset] === 0x50 && malformed[offset + 1] === 0x4b && malformed[offset + 2] === 0x05 && malformed[offset + 3] === 0x06,
    );
    expect(endRecord).toBeGreaterThanOrEqual(0);
    expect(endOffset).toBeDefined();
    if (endOffset === undefined) return;
    malformed.fill(0, endOffset + 12, endOffset + 16);
    await expectCode(parseEpub(malformed.buffer), "invalidZip");
  });

  it("enforces per-entry and aggregate decompressed ZIP limits", async () => {
    const oversizedChapter = "x".repeat(MAX_ENTRY_BYTES + 1);
    await expectCode(
      parseEpub(validEpub3({ "OEBPS/text/one.xhtml": oversizedChapter })),
      "tooLarge",
    );

    const aggregateBytes = new Uint8Array(19 * 1024 * 1024);
    const manifest = Array.from({ length: 11 }, (_, index) => `<item id="chapter-${index}" href="chapter-${index}.xhtml" media-type="application/xhtml+xml" />`).join("");
    const spine = Array.from({ length: 11 }, (_, index) => `<itemref idref="chapter-${index}" />`).join("");
    const aggregateEntries: Record<string, string | Uint8Array> = {
      "META-INF/container.xml": CONTAINER_XML,
      "OEBPS/content.opf": `<package xmlns="http://www.idpf.org/2007/opf"><metadata /><manifest>${manifest}</manifest><spine>${spine}</spine></package>`,
    };
    for (let index = 0; index < 11; index += 1) aggregateEntries[`OEBPS/chapter-${index}.xhtml`] = aggregateBytes;
    await expectCode(parseEpub(epubBuffer(aggregateEntries)), "tooLarge");
  });

  it("rejects malformed ZIP bytes and buffers above the input limit", async () => {
    await expectCode(parseEpub(new TextEncoder().encode("not a zip").buffer), "invalidZip");
    await expectCode(parseEpub(new ArrayBuffer(50 * 1024 * 1024 + 1)), "tooLarge");
    await expectCode(parseEpub(new Uint8Array([0x50, 0x4b, 0x03, 0x04]).buffer), "invalidZip");
  });

  it("rejects missing container, missing OPF, and empty spine structures", async () => {
    await expectCode(parseEpub(epubBuffer({ "OEBPS/content.opf": EPUB2_OPF })), "missingContainer");
    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
        }),
      ),
      "invalidPackage",
    );
    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
          "OEBPS/content.opf": "<package xmlns=\"http://www.idpf.org/2007/opf\"><manifest /></package>",
        }),
      ),
      "emptySpine",
    );
  });

  it("rejects non-linear-only and punctuation-only books as unreadable", async () => {
    const nonLinearOpf = EPUB2_OPF.replace('<itemref idref="body" />', '<itemref idref="body" linear="no" />');
    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
          "OEBPS/content.opf": nonLinearOpf,
          "OEBPS/chapter.xhtml": "<html><body><p>Hidden body.</p></body></html>",
        }),
      ),
      "noReadableText",
    );

    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
          "OEBPS/content.opf": EPUB2_OPF,
          "OEBPS/chapter.xhtml": "<html><body><p>?! …</p></body></html>",
        }),
      ),
      "noReadableText",
    );
  });

  it("preserves wordless linear XHTML items as empty sections when readable text exists elsewhere", async () => {
    const opf = `<package xmlns="http://www.idpf.org/2007/opf"><metadata /><manifest><item id="empty" href="empty.xhtml" media-type="application/xhtml+xml" /><item id="readable" href="readable.xhtml" media-type="application/xhtml+xml" /></manifest><spine><itemref idref="empty" /><itemref idref="readable" /></spine></package>`;
    const document = await parseEpub(
      epubBuffer({
        "META-INF/container.xml": CONTAINER_XML,
        "OEBPS/content.opf": opf,
        "OEBPS/empty.xhtml": "<html><body><p>?!</p></body></html>",
        "OEBPS/readable.xhtml": "<html><body><p>Readable text.</p></body></html>",
      }),
    );
    expect(document.sections).toHaveLength(2);
    expect(document.sections[0]?.paragraphs).toEqual([]);
    expect(textOf(document)).toContain("Readable text.");
  });

  it("rejects encrypted or DRM-only spine resources as unreadable", async () => {
    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
          "META-INF/rights.xml": "<rights />",
          "META-INF/encryption.xml": "<encryption><EncryptedData><CipherReference URI=\"OEBPS/chapter.xhtml\" /></EncryptedData></encryption>",
          "OEBPS/content.opf": EPUB2_OPF,
          "OEBPS/chapter.xhtml": "<html><body><p>Encrypted body.</p></body></html>",
        }),
      ),
      "noReadableText",
    );
  });

  it("rejects XML parser errors and archive path traversal", async () => {
    const malformedOpf = "<package xmlns=\"http://www.idpf.org/2007/opf\"><manifest>";
    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
          "OEBPS/content.opf": malformedOpf,
        }),
      ),
      "invalidPackage",
    );

    const traversalOpf = EPUB2_OPF.replace('href="chapter.xhtml"', 'href="%2e%2e/%2e%2e/outside.xhtml"');
    await expectCode(
      parseEpub(
        epubBuffer({
          "META-INF/container.xml": CONTAINER_XML,
          "OEBPS/content.opf": traversalOpf,
          "outside.xhtml": "<html><body><p>Outside.</p></body></html>",
        }),
      ),
      "invalidPackage",
    );
  });
});
