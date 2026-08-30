const BLOCK_ELEMENTS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "dd",
  "div",
  "dl",
  "dt",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "td",
  "th",
  "tr",
  "ul",
]);

const REMOVED_ELEMENTS = new Set(["script", "style", "noscript", "svg", "audio", "video", "img"]);
const HEADING_ELEMENTS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);
const EXCLUDED_TEXT_ELEMENTS = new Set(["title", ...HEADING_ELEMENTS]);

function localName(element: Element): string {
  return (element.localName || element.tagName).toLowerCase();
}

function textValue(element: Element | undefined): string {
  return element?.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

function hasAncestor(element: Element | null, names: Set<string>, root: Element): boolean {
  let current: Element | null = element;
  while (current !== null) {
    if (names.has(localName(current))) return true;
    if (current === root) break;
    current = current.parentElement;
  }
  return false;
}

function blockAncestor(element: Element | null, root: Element): Node {
  let current: Element | null = element;
  while (current !== null && current !== root) {
    if (BLOCK_ELEMENTS.has(localName(current))) return current;
    current = current.parentElement;
  }
  return root;
}

function parsedDocument(source: string): XMLDocument {
  const document = new DOMParser().parseFromString(source, "application/xhtml+xml");
  const root = document.documentElement;
  if (root === null || localName(root) === "parsererror" || document.querySelector("parsererror") !== null) {
    throw new Error("XHTML parser error");
  }
  return document;
}

export type ExtractedXhtmlText = {
  title?: string;
  paragraphs: string[];
};

export function extractXhtmlText(source: string): ExtractedXhtmlText {
  const document = parsedDocument(source);
  const root = document.documentElement;
  const elements = Array.from(root.getElementsByTagName("*"));
  const titleElement = elements.find((element) => localName(element) === "title");
  const headingElement = elements.find((element) => HEADING_ELEMENTS.has(localName(element)));
  const title = textValue(titleElement ?? headingElement);

  const paragraphs: string[] = [];
  let activeBlock: Node | undefined;
  let current = "";
  const flush = () => {
    const paragraph = current.replace(/\s+/gu, " ").trim();
    if (paragraph.length > 0) paragraphs.push(paragraph);
    current = "";
  };

  const walker = document.createTreeWalker(root, 4);
  let node = walker.nextNode();
  while (node !== null) {
    const parent = node.parentElement;
    if (parent !== null && !hasAncestor(parent, REMOVED_ELEMENTS, root) && !hasAncestor(parent, EXCLUDED_TEXT_ELEMENTS, root)) {
      const block = blockAncestor(parent, root);
      if (activeBlock !== undefined && activeBlock !== block) flush();
      activeBlock = block;
      current += node.nodeValue ?? "";
    }
    node = walker.nextNode();
  }
  flush();

  return title.length === 0 ? { paragraphs } : { title, paragraphs };
}

