import { strToU8, zipSync } from "fflate";

export const CONTAINER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml" /></rootfiles>
</container>`;

export const EPUB3_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package version="3.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Fixture Book</dc:title><dc:creator>Fixture Author</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter-one" href="text/one.xhtml" media-type="application/xhtml+xml" />
    <item id="chapter-two" href="text/two.xhtml" media-type="application/xhtml+xml" />
  </manifest>
  <spine><itemref idref="chapter-one" /><itemref idref="chapter-two" /></spine>
</package>`;

export const EPUB2_OPF = `<?xml version="1.0" encoding="UTF-8"?>
<package version="2.0" xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>EPUB Two</dc:title><dc:creator>Author Two</dc:creator></metadata>
  <manifest><item id="body" href="chapter.xhtml" media-type="application/xhtml+xml" /></manifest>
  <spine toc="ncx"><itemref idref="body" /></spine>
</package>`;

export const XHTML_WITH_SAFE_TEXT = `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Safe Chapter</title><style>.hidden{display:none}</style></head>
<body><h1>Safe Chapter</h1><p>First <em>readable</em> paragraph.</p><script>evil words must disappear</script><p>Second paragraph.</p><svg><text>svg words</text></svg><style>style words</style></body></html>`;

export function epubBuffer(entries: Record<string, string | Uint8Array>): ArrayBuffer {
  const files: Record<string, Uint8Array> = {};
  for (const [path, content] of Object.entries(entries)) {
    files[path] = typeof content === "string" ? strToU8(content) : content;
  }
  const bytes = zipSync(files);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function validEpub3(overrides: Record<string, string | Uint8Array> = {}): ArrayBuffer {
  return epubBuffer({
    "mimetype": "application/epub+zip",
    "META-INF/container.xml": CONTAINER_XML,
    "OEBPS/content.opf": EPUB3_OPF,
    "OEBPS/text/one.xhtml": XHTML_WITH_SAFE_TEXT,
    "OEBPS/text/two.xhtml": "<html xmlns=\"http://www.w3.org/1999/xhtml\"><body><p>Third paragraph.</p></body></html>",
    ...overrides,
  });
}
