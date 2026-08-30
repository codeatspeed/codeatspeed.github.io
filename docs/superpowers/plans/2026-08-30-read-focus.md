# Read/Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a polished static GitHub Pages website that imports local EPUB/text content and presents a word-only, pivot-grapheme speed reader with optional context peek, responsive expanded mode, and local progress persistence.

**Architecture:** A React + TypeScript single-page application is built by Vite and published as static assets through GitHub Actions. A browser-only document pipeline converts pasted text or non-DRM text EPUBs into a normalized token model; a pure timing/layout core drives the reader; React renders import, reader, settings, and error states. Hash routes and an injected Vite base path make the app work at a GitHub Pages project-site URL.

**Tech Stack:** TypeScript, React, Vite, `@vitejs/plugin-react`, `fflate`, `idb`, `grapheme-splitter`, Vitest, Testing Library, `fake-indexeddb`, Playwright, `start-server-and-test`, GitHub Pages Actions.

## Global Constraints

- Focus mode is the default and renders only the active word during playback.
- The exact pivot grapheme is colored; its measured visual center aligns with the fixed center rail.
- Context peek is optional and must be width-tested before neighboring words are shown.
- No imported book content is uploaded; all parsing and persistence happen in the browser.
- GitHub Pages is the only v1 deployment target; no Worker, API, account, database, or R2 path may be added.
- Prefer a user-site repository named `<github-username>.github.io` so the default URL and a custom domain both use `VITE_BASE_PATH=/`. If the repository is a project site, use `VITE_BASE_PATH=/${repository-name}/` and test that path explicitly.
- Only non-DRM, text-based EPUB 2/3 content is supported; unsupported content receives an actionable error.
- No displayed word may be clipped, wrapped mid-word, hidden, or horizontally scrolled.
- Width fallback order is: fit phrase → reduce neighbors → active word only → reduce oversized word → complete long-word hold.
- The public UI uses focused-mode language, not training, scoring, leaderboard, or comprehension-grade language.
- WPM presets may include a 5× aspiration, but the UI must show actual WPM and must not promise a reader-specific result.
- Keyboard, reduced-motion, high-contrast, visible-focus, and touch-target requirements apply to every interactive state.
- Do not add telemetry; GitHub Pages request metadata is the only hosting-level traffic data in scope.

---

## File and responsibility map

Create the following focused units before implementation begins:

- `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `index.html`: application and build configuration.
- `scripts/serve-pages.mjs`: deterministic local static server that strips the configured Pages base path for smoke tests.
- `public/favicon.svg`: minimal product mark.
- `src/main.tsx`: React bootstrap and root stylesheet import.
- `src/app/App.tsx`: top-level route selection, global error boundary, app shell, and transient import-notice handoff.
- `src/app/router.ts`: hash route parsing and navigation helpers.
- `src/domain/document.ts`: normalized document, section, sentence, and token types.
- `src/domain/settings.ts`: persisted reader settings and defaults.
- `src/domain/reader-state.ts`: playback state and serializable position types.
- `src/lib/text/segment.ts`: Unicode grapheme/word/sentence segmentation and pivot selection.
- `src/lib/text/normalize.ts`: pasted-text to normalized-document conversion.
- `src/lib/epub/epub-parser.ts`: EPUB ZIP/container/OPF/spine extraction.
- `src/lib/epub/xhtml-text.ts`: safe XHTML text extraction without mounting imported markup.
- `src/lib/reader/pivot.ts`: measured pivot offset math.
- `src/lib/reader/context-window.ts`: width-tested context-window selection.
- `src/lib/reader/playable-stream.ts`: word-only playback stream with punctuation/whitespace filtering.
- `src/lib/reader/timing.ts`: deterministic WPM and pause-duration calculations.
- `src/lib/persistence/database.ts`: IndexedDB schema and CRUD operations.
- `src/features/import/ImportPage.tsx`: landing/import UI.
- `src/features/import/import-controller.ts`: file/text validation and import orchestration.
- `src/features/reader/ReaderPage.tsx`: reader route and document loading.
- `src/features/reader/ReaderSurface.tsx`: focus/context rendering and expanded layer.
- `src/features/reader/ReaderControls.tsx`: playback, WPM, phrase-size, and progress controls.
- `src/features/reader/useReaderController.ts`: playback state machine and persistence integration.
- `src/features/settings/SettingsDrawer.tsx`: font, contrast, pause, and shortcut settings.
- `src/components/ErrorNotice.tsx`, `src/components/ModalLayer.tsx`: reusable accessible feedback primitives.
- `src/styles/tokens.css`, `src/styles/global.css`, `src/styles/reader.css`: visual system and responsive reader styles.
- `tests/setup.ts`: Vitest DOM and matcher setup.
- `tests/fixtures/epub-fixtures.ts`: deterministic in-memory EPUB fixtures.
- `tests/unit/segment.test.ts`, `tests/unit/normalize.test.ts`, `tests/unit/epub-parser.test.ts`: import pipeline tests.
- `tests/unit/pivot.test.ts`, `tests/unit/context-window.test.ts`, `tests/unit/playable-stream.test.ts`, `tests/unit/timing.test.ts`: pure reader-core tests.
- `tests/unit/database.test.ts`: persistence tests using `fake-indexeddb`.
- `tests/components/import-page.test.tsx`, `tests/components/reader-surface.test.tsx`: observable UI behavior tests.
- `tests/smoke/pages-path.test.ts`: built-site HTTP and browser smoke test against the Pages-style base path.

---

### Task 1: Scaffold the static React application

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `index.html`
- Create: `src/main.tsx`
- Create: `src/app/App.tsx`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `tests/setup.ts`
- Test: `tests/components/import-page.test.tsx`

**Interfaces:**
- Produces `src/main.tsx` mounting `<App />` into `#root`.
- Produces `vite.config.ts` using `process.env.VITE_BASE_PATH ?? "/"` as `base`.
- Produces `vitest.config.ts` using the `jsdom` environment and `tests/setup.ts`.
- Produces `playwright.config.ts` with `baseURL: "http://127.0.0.1:4173"` and Chromium project defaults.
- Produces `npm run dev`, `npm run build`, `npm run test`, `npm run test:watch`, `npm run preview:smoke`, and `npm run test:smoke` scripts.

- [ ] **Step 1: Add package and TypeScript configuration**

Use React, Vite, `@vitejs/plugin-react`, `fflate`, `idb`, `grapheme-splitter`, `start-server-and-test`, and the test dependencies listed in the header. Add `@types/node` for Vite config environment access and `@playwright/test` for the production browser smoke. Set TypeScript to strict mode, emit no JavaScript, resolve modules using bundler mode, and include `src` plus `tests`.

```bash
npm install react react-dom fflate idb grapheme-splitter
npm install --save-dev @vitejs/plugin-react typescript vite vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @types/react @types/react-dom @types/node fake-indexeddb @playwright/test start-server-and-test
```

Define these scripts in `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "preview:smoke": "node scripts/serve-pages.mjs dist 4173",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:smoke": "start-server-and-test preview:smoke http://127.0.0.1:4173 \"playwright test tests/smoke/pages-path.test.ts\""
  }
}
```

Commit the generated `package-lock.json`; CI uses `npm ci` and must never resolve an unpinned dependency graph.

- [ ] **Step 2: Configure Vitest and Playwright**

Create `vitest.config.ts` with `environment: "jsdom"`, `setupFiles: ["./tests/setup.ts"]`, and a test include covering `tests/**/*.{test,spec}.{ts,tsx}`. Create `tests/setup.ts` importing `@testing-library/jest-dom/vitest` and installing a minimal `ResizeObserver` test double when jsdom does not provide one. Create `playwright.config.ts` with `testDir: "tests/smoke"`, `use.baseURL: "http://127.0.0.1:4173"`, and Chromium as the project.

- [ ] **Step 3: Add the Vite entry and base-path configuration**

Configure the React plugin and use `base: process.env.VITE_BASE_PATH ?? "/"`. The HTML entry must contain `<div id="root"></div>` and a descriptive document title.

- [ ] **Step 4: Add the visual tokens and global reset**

Define the approved graphite, ivory, lime, and orange tokens; set `color-scheme: dark`; establish system sans and editorial serif stacks; reset buttons/inputs without removing focus outlines; and add a reduced-motion media rule.

- [ ] **Step 5: Add a minimal App shell**

Render a branded landing placeholder with an accessible main landmark. Keep import logic out of this task; the shell only proves the build and styles load.

- [ ] **Step 6: Write and run the first component smoke test**

```tsx
it("mounts the public reader shell", () => {
  render(<App />);
  expect(screen.getByRole("main")).toBeInTheDocument();
});
```

Run: `npm test -- --run tests/components/import-page.test.tsx`
Expected: PASS after the shell is mounted.

- [ ] **Step 7: Commit the scaffold**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vite.config.ts vitest.config.ts playwright.config.ts index.html src tests/setup.ts tests/components/import-page.test.tsx
git commit -m "feat: scaffold static reader app"
```

### Task 2: Define the normalized document and Unicode text pipeline

**Files:**
- Create: `src/domain/document.ts`
- Create: `src/domain/settings.ts`
- Create: `src/domain/reader-state.ts`
- Create: `src/lib/text/segment.ts`
- Create: `src/lib/text/normalize.ts`
- Create: `tests/unit/segment.test.ts`
- Create: `tests/unit/normalize.test.ts`

**Interfaces:**
- `type TextSegment = { text: string; kind: "word" | "punctuation" | "whitespace" }`
- `segmentGraphemes(text: string): string[]`
- `segmentWords(text: string): TextSegment[]`
- `selectPivotIndex(graphemes: string[]): number`
- `normalizeText(input: string, metadata?: { title?: string; author?: string }): Document`
- `ReaderSettings { wpm: number; phraseSize: number; fontScale: number; contrast: "default" | "high"; pauseProfile: "minimal" | "balanced" | "generous"; reducedMotion: boolean; showContextByDefault: boolean }`
- `DEFAULT_READER_SETTINGS = { wpm: 1000, phraseSize: 3, fontScale: 1, contrast: "default", pauseProfile: "balanced", reducedMotion: false, showContextByDefault: false }`
- `ReaderPosition { documentId: string; sectionIndex: number; sentenceIndex: number; tokenIndex: number }`
- `ReaderNotice { kind: "storage-unavailable"; message: string }`
- `ReaderState { position: ReaderPosition; status: "loading" | "paused" | "playing" | "complete" | "error"; mode: "focus" | "context"; renderMode: "focus" | "context" | "long-word-hold"; settings: ReaderSettings; notice?: ReaderNotice; expanded: boolean }`
- `Token` includes `text`, `kind`, `graphemes`, `pivotIndex`, `boundaryAfter`, and `punctuationAfter: string`; `punctuationAfter` is punctuation consumed from the following token boundary and is never rendered as its own playback step.
- `Document`, `Section`, `Paragraph`, `Sentence`, and `Token` match the approved spec.

- [ ] **Step 1: Write failing segmentation tests**

Cover ASCII words, punctuation boundaries, combining marks, emoji graphemes, repeated whitespace, empty text, and a long compound word. Assert that combining sequences remain one grapheme, punctuation is not classified as a word, and pivot selection is deterministic and in bounds.

- [ ] **Step 2: Implement grapheme, word segmentation, and pivot selection**

Use `Intl.Segmenter` with `granularity: "grapheme"` and `granularity: "word"` when available. Use the `grapheme-splitter` dependency for fallback grapheme segmentation so combining marks, surrogate pairs, and common ZWJ emoji sequences are not split. Use a deterministic whitespace/punctuation tokenizer for word fallback.

- [ ] **Step 3: Write failing normalization tests**

Verify that blank or punctuation-only input is rejected, paragraphs remain separated, sentences receive `boundaryAfter: "sentence"`, section-ending boundaries take precedence over paragraph boundaries, and the first token position is deterministic.

- [ ] **Step 4: Implement `normalizeText`**

Normalize line endings, trim only empty boundary lines, split paragraphs on blank-line boundaries, segment sentences without removing meaningful punctuation, create token kinds, and compute each word's grapheme array plus `pivotIndex` by calling `selectPivotIndex`. Reject the result when it contains no word tokens so `ReaderViewModel.activeToken` is always defined. When a token closes both a paragraph and a section, encode `boundaryAfter: "section"` as the stronger single boundary; preserve sentence boundaries otherwise. Keep this function pure and testable.

- [ ] **Step 5: Run focused unit tests**

Run: `npm test -- --run tests/unit/segment.test.ts tests/unit/normalize.test.ts`
Expected: PASS, with failures isolated to missing implementations before Step 4 and no skipped cases afterward.

- [ ] **Step 6: Commit the text model**

```bash
git add src/domain src/lib/text tests/unit/segment.test.ts tests/unit/normalize.test.ts
git commit -m "feat: add normalized unicode text model"
```

---

### Task 3: Parse compatible EPUBs into the common document model

**Files:**
- Create: `src/lib/epub/epub-parser.ts`
- Create: `src/lib/epub/xhtml-text.ts`
- Create: `tests/fixtures/epub-fixtures.ts`
- Create: `tests/unit/epub-parser.test.ts`

**Interfaces:**
- `parseEpub(buffer: ArrayBuffer): Promise<Document>`
- `EpubImportError` with codes `invalidZip`, `tooLarge`, `missingContainer`, `invalidPackage`, `emptySpine`, and `noReadableText`.
- `extractXhtmlText(source: string): { title?: string; paragraphs: string[] }`

- [ ] **Step 1: Write failing EPUB fixture tests**

Generate in-memory EPUB buffers containing: a valid EPUB 3 container and spine, an EPUB 2 package, out-of-order manifest items proving spine order, metadata title/author, malformed ZIP bytes, an oversized buffer, missing container.xml, missing OPF, empty spine, `linear="no"` spine items, default XML namespaces, percent-encoded and nested hrefs, XML parser errors, and XHTML with script/style elements. Assert that scripts/styles are not returned as text and non-linear-only or punctuation-only content is rejected.

- [ ] **Step 2: Implement safe XHTML text extraction**

Parse XHTML with `DOMParser`, reject documents whose root is missing or contains a parser-error element, remove `script`, `style`, `noscript`, `svg`, `audio`, `video`, and `img` nodes, extract heading/title metadata, convert block elements to paragraph boundaries, and return text only. Do not assign imported source to `innerHTML` in the application document.

- [ ] **Step 3: Implement bounded ZIP/container/package resolution**

Reject `File.size` over `50 * 1024 * 1024` before `arrayBuffer()` in the import controller, and repeat the buffer check inside `parseEpub`. Use fflate's streaming `Unzip` API rather than unbounded `unzipSync`; count decompressed bytes per entry and across the archive, aborting at `20 * 1024 * 1024` per entry or `200 * 1024 * 1024` total. Require `META-INF/container.xml`. Parse container and OPF XML by local name so default namespaces work, reject parser-error documents, resolve the rootfile path, decode percent-encoded hrefs, normalize POSIX paths, reject traversal outside the archive root, parse the OPF manifest/spine, and skip `linear="no"` items. Reject missing or malformed structures with typed errors.

- [ ] **Step 4: Normalize spine content**

Convert each readable spine item into a section, preserve title/author metadata when present, concatenate only in declared spine order, and throw `noReadableText` when every section is empty, contains no word tokens, or every spine item is `linear="no"`. DRM/image-only/media-only content must take this error path rather than pretending to import.

- [ ] **Step 5: Run focused EPUB tests**

Run: `npm test -- --run tests/unit/epub-parser.test.ts`
Expected: PASS for EPUB 2/3, order, metadata, safe extraction, size limits, and every typed failure case.

- [ ] **Step 6: Commit the importer**

```bash
git add src/lib/epub tests/fixtures/epub-fixtures.ts tests/unit/epub-parser.test.ts
git commit -m "feat: parse local text epubs"
```

---

### Task 4: Add local IndexedDB persistence

**Files:**
- Create: `src/lib/persistence/database.ts`
- Create: `tests/unit/database.test.ts`
- Modify: `package.json` and `package-lock.json` to add `fake-indexeddb` as a dev dependency

**Interfaces:**
- `type ReaderDatabase = { documents: { key: string; value: Document }; positions: { key: string; value: ReaderPosition }; settings: { key: "settings"; value: ReaderSettings }; metadata: { key: "last-opened"; value: string } }`
- `openReaderDatabase(): Promise<IDBPDatabase<ReaderDatabase>>`
- `saveDocument(document: Document): Promise<void>`
- `getDocument(id: string): Promise<Document | undefined>`
- `savePosition(position: ReaderPosition): Promise<void>`
- `getPosition(documentId: string): Promise<ReaderPosition | undefined>`
- `saveSettings(settings: ReaderSettings): Promise<void>`
- `getSettings(): Promise<ReaderSettings>`
- `saveLastOpenedDocumentId(documentId: string): Promise<void>`
- `getLastOpenedDocumentId(): Promise<string | undefined>`
- `StorageUnavailableError`

- [ ] **Step 1: Write failing persistence tests**

Using `fake-indexeddb`, verify document round-trip, position overwrite, settings defaults, last-opened ID round-trip, missing-record reads, and a simulated quota/open failure that returns `StorageUnavailableError`. Include a failed position write after a prior persisted position and assert the newest in-memory position is returned in the same session.

- [ ] **Step 2: Implement a versioned schema**

Create object stores `documents`, `positions`, `settings`, and `metadata`. Use the document ID as the document key, document ID as the position key, one fixed `"settings"` key, and one fixed `"last-opened"` metadata key. Keep stored values JSON-serializable and version the database at `1`.

- [ ] **Step 3: Add best-effort wrappers and volatile fallback**

Update the volatile cache before each IndexedDB write. On open/read/write failures, map the failure to `StorageUnavailableError`, keep the newest in-memory value authoritative for the current session, and expose the last-opened ID through the metadata API. Reads use the current-session cache first and IndexedDB second, so a failed write cannot expose an older position during the same session. Do not silently discard a failed write.

- [ ] **Step 4: Run persistence tests**

Run: `npm test -- --run tests/unit/database.test.ts`
Expected: PASS, including failure behavior.

- [ ] **Step 5: Commit persistence**

```bash
git add src/lib/persistence tests/unit/database.test.ts package.json package-lock.json
git commit -m "feat: persist local reader state"
```

---

### Task 5: Implement pivot-grapheme layout, context fitting, playable stream, and timing

**Files:**
- Create: `src/lib/reader/pivot.ts`
- Create: `src/lib/reader/context-window.ts`
- Create: `src/lib/reader/playable-stream.ts`
- Create: `src/lib/reader/timing.ts`
- Create: `tests/unit/pivot.test.ts`
- Create: `tests/unit/context-window.test.ts`
- Create: `tests/unit/playable-stream.test.ts`
- Create: `tests/unit/timing.test.ts`

**Interfaces:**
- `computePivotOffset(input: { beforeWidth: number; pivotWidth: number; railX: number }): number`
- `type TokenMeasurement = { width: number; beforePivotWidth: number; pivotWidth: number }`
- `type MeasuredToken = { token: Token; width: number; beforePivotWidth: number; pivotWidth: number }`
- `type ContextWindowInput = { left: Token[]; active: Token; right: Token[]; phraseSize: number; maxWidth: number; surfaceWidth: number; railX: number; horizontalPadding: number; gapWidth: number; baseFontScale: number; minFontScale: number; measure(token: Token, fontScale: number): TokenMeasurement }`
- `type ContextWindowResult = { left: MeasuredToken[]; active: MeasuredToken; right: MeasuredToken[]; mode: "focus" | "context" | "long-word-hold"; fontScale: number; scaleX: number }`
- `chooseContextWindow(input: ContextWindowInput): ContextWindowResult`
- `type PlayableToken = { token: Token; position: ReaderPosition; punctuationAfter: string }`
- `createPlayableStream(document: Document): PlayableToken[]`
- `type TimingInput = { wpm: number; punctuationAfter: string; boundaryAfter: Token["boundaryAfter"]; isLongWord: boolean; pauseProfile: ReaderSettings["pauseProfile"] }`
- `durationForToken(input: TimingInput): number`
- `timingForToken(input: { token: Token; settings: ReaderSettings; isLongWord?: boolean }): number`

- [ ] **Step 1: Write failing pivot tests**

Cover offset math with uneven before/pivot widths and assert the pivot center lands on the rail. Include short and long words by passing measured grapheme widths; assert that no whole-word-centering calculation is used.

- [ ] **Step 2: Implement measured offset math**

Compute `wordStartX = railX - beforeWidth - pivotWidth / 2`; return the start offset required by the renderer. Do not use whole-word centering as the primary calculation. Pivot selection itself is provided by `selectPivotIndex` from Task 2.

- [ ] **Step 3: Write failing context-window tests**

Given token candidates and a surface width, assert the largest fitting context is selected, neighbors are removed before legibility is reduced, active-word-only is returned when necessary, a single oversized word is marked for long-word hold, and an extreme word receives `scaleX <= 1` so its complete text remains visible. Assert that rail-side padding, inter-word gaps, and pivot-centered left/right bounds are respected.

- [ ] **Step 4: Implement width fallback**

Accept raw token candidates plus the injected grapheme-aware `measure` function at each font scale. Check the complete phrase against both sides of the rail, including gaps and horizontal padding, using `beforePivotWidth` and `pivotWidth` rather than whole-token centering. Enforce the exact sequence: phrase, fewer neighbors, active word, reduced font request, long-word hold. For a word that still exceeds the surface at the minimum font scale, return `scaleX = maxWidth / measuredWidth` and `mode: "long-word-hold"`; apply the transform with `transform-origin` at the pivot glyph center so the pivot remains on the rail. Return the visible context only; playback still advances one active word at a time.

- [ ] **Step 5: Write failing playable-stream tests**

Assert whitespace tokens never produce display steps, punctuation is consumed into the preceding word's `punctuationAfter` and boundary metadata, word positions remain stable, and an all-whitespace document yields an empty playable stream.

- [ ] **Step 6: Implement the playable stream**

Flatten sections and sentences in order, skip whitespace, attach punctuation to the preceding word's `punctuationAfter`, and emit only word tokens with their original `ReaderPosition`. Never schedule a blank display step.
- [ ] **Step 7: Write failing timing tests**

Assert base duration follows `60000 / wpm`, punctuation adds a configured pause, sentence/paragraph/section boundaries add predictable pauses with section taking precedence over paragraph at a section close, Context peek does not change duration or token order, WPM changes affect duration only, and long-word hold duration is never zero.

- [ ] **Step 8: Implement deterministic timing**

Keep timing pure and driven only by the active word's metadata plus a settings snapshot. Clamp WPM and pause values to finite positive ranges. Apply `punctuationAfter` independently from the single `boundaryAfter` modifier; use the strongest boundary when a section-ending token also closes a paragraph so the pause is not double-counted. Keep clock scheduling out of this module.

- [ ] **Step 9: Run reader-core tests**

Run: `npm test -- --run tests/unit/pivot.test.ts tests/unit/context-window.test.ts tests/unit/playable-stream.test.ts tests/unit/timing.test.ts`
Expected: PASS with boundary cases covered and no DOM dependency.

- [ ] **Step 10: Commit the reader core**

```bash
git add src/lib/reader tests/unit/pivot.test.ts tests/unit/context-window.test.ts tests/unit/playable-stream.test.ts tests/unit/timing.test.ts
git commit -m "feat: add pivot reader timing core"
```

---


### Task 6: Build the import landing experience

**Files:**
- Create: `src/app/router.ts`
- Create: `src/features/import/ImportPage.tsx`
- Create: `src/features/import/import-controller.ts`
- Create: `src/components/ErrorNotice.tsx`
- Modify: `src/app/App.tsx`
- Modify: `tests/components/import-page.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- `type Route = { name: "home" } | { name: "read"; documentId: string }`
- `type RouteResult = { ok: true; route: Route } | { ok: false; error: "invalid-route" }`
- `parseRoute(hash: string): RouteResult`
- `navigate(route: Route): void`
- `type ImportResult = { document: Document; notice?: ReaderNotice }`
- `importPastedText(text: string): Promise<ImportResult>`
- `importEpubFile(file: File): Promise<ImportResult>`

- [ ] **Step 1: Write failing import UI tests**

Cover visible EPUB picker, paste textarea, sample action, local-only privacy copy, empty-paste error preserving input, unsupported file type error, malformed EPUB error, storage-unavailable import returning a usable document plus a visible non-blocking notice after navigation to the reader, successful navigation to `#/read/<id>`, and keyboard activation of the drop zone.

- [ ] **Step 2: Implement hash routing**

Parse `#/` as home and `#/read/<encoded-id>` as reader. Decode the ID with `decodeURIComponent` inside a try/catch; malformed encoding returns `{ ok: false, error: "invalid-route" }` and renders the import page rather than throwing. Listen for both `hashchange` and `popstate`; use `encodeURIComponent` for IDs. Do not use history-mode routes that require server rewrites.

- [ ] **Step 3: Implement import orchestration**

Accept only `.epub` files or MIME types that end in `epub+zip`. Reject `file.size > 50 * 1024 * 1024` before reading the file. Read the file as an ArrayBuffer; call `parseEpub`; normalize pasted text; attempt to save the document and its last-opened ID through the persistence wrapper; return `{ document, notice }` even when either write raises `StorageUnavailableError`; navigate only after a valid document exists. The app retains the returned notice while routing to the reader, renders it as a dismissible non-blocking notice, and keeps the volatile document/ID authoritative for the session. Catch unknown parser exceptions, map them to a user-safe message, and never render raw exception text. Do not create a second feature-local cache.

- [ ] **Step 4: Build the landing UI**

Use the approved editorial layout: author/product mark, concise promise, drop zone, paste action, sample action, local privacy notice, help link, and restrained footer. Use semantic labels and live regions for import status/errors. When import returns an `ImportResult`, App stores its optional notice before changing the hash and passes it as `initialNotice` to `ReaderPage`; ReaderPage gives it to `useReaderController`, which owns dismissal and later persistence notices. Avoid training/scoring copy.

- [ ] **Step 5: Run import component tests**

Run: `npm test -- --run tests/components/import-page.test.tsx`
Expected: PASS for success, failure, privacy copy, keyboard, and preserved input behavior.

- [ ] **Step 6: Commit the import experience**

```bash
git add src/app src/features/import src/components/ErrorNotice.tsx src/styles/global.css tests/components/import-page.test.tsx
git commit -m "feat: add local epub and text import"
```

---

### Task 7: Build the focus reader and playback controller

**Files:**
- Create: `src/features/reader/ReaderPage.tsx`
- Create: `src/features/reader/ReaderSurface.tsx`
- Create: `src/features/reader/ReaderControls.tsx`
- Create: `src/features/reader/useReaderController.ts`
- Create: `src/components/ModalLayer.tsx`
- Create: `tests/components/reader-surface.test.tsx`
- Create: `src/styles/reader.css`

**Interfaces:**
- `type LayoutModeReport = { position: ReaderPosition; mode: ContextWindowResult["mode"] }`
- `type ReaderController = { state: ReaderState; togglePlayback(): void; stepPrevious(): void; stepNext(): void; setWpm(wpm: number): void; setMode(mode: "focus" | "context"): void; setRenderedMode(report: LayoutModeReport): void; setPhraseSize(size: number): void; setExpanded(expanded: boolean): void; restartFromCurrentSection(): void; dismissNotice(): void }`
- `useReaderController(document: Document, initialNotice?: ReaderNotice): ReaderController`
- `type ReaderViewModel = { activeToken: Token; activePosition: ReaderPosition; layout: ContextWindowResult; progress: number }`
- `ReaderSurface` consumes `{ document: Document; state: ReaderState; view: ReaderViewModel; onRenderedMode(report: LayoutModeReport): void }` and renders focus/context plus the derived long-word layout state.

- [ ] **Step 1: Write failing reader behavior tests**

Cover focus mode as the default, persisted `showContextByDefault` restoring Context mode, exact pivot grapheme rendered with a separate accessible label, Context peek toggle, previous/next without token reorder, WPM control, pause/resume, progress updates, initial position restoration, invalid document ID recovery, storage-read failure falling back to defaults and the first valid word, safe stop at an invalid token, final-word completion retaining a valid active token and allowing previous/restart, screen-reader announcements on manual step/pause, no rapid live-region flood during autoplay, a focused play/pause button receiving Space without double-toggling, and a Back action that closes expanded mode before leaving the reader.

- [ ] **Step 2: Implement the controller state machine**

Initialize `status: "loading"` and disable playback until both validated settings and position restoration complete. Load `getSettings()` before playback, merge it with defaults, derive initial `mode` from `showContextByDefault` (default false), and initialize `notice` from `initialNotice`. Catch `StorageUnavailableError` by using default settings, retaining the in-memory notice, and continuing. Build `createPlayableStream(document)` once, keep its current index internal, and restore the validated `ReaderPosition` to a stream index after `getPosition(document.id)` resolves; catch a position-read failure by using the first valid word, retaining the notice, and continuing. Guard the async restore with a generation counter and ignore late results after unmount or document change. After restoration, set `status: "paused"` at the restored word or first word. The scheduler effect depends on `status`, current stream index, WPM, pause settings, and `renderMode`; it clears the old timeout and schedules exactly one replacement on every change. Each tick calls `timingForToken({ token: activeToken, settings, isLongWord: state.renderMode === "long-word-hold" })`, advances exactly one playable word in every mode, and when the last word elapses retains stream index `N - 1`, the final valid `activeToken`/`activePosition`, and sets `status: "complete"` rather than dereferencing index `N`. `stepPrevious` from complete resumes at the prior valid word; restart resets to the first playable word in the current section. Update the serializable position and debounce `savePosition`. Flush the latest position with a direct save on unmount when possible; catch storage failures, set the non-blocking notice, and keep the reader usable. Ignore a `setRenderedMode` report whose position does not equal the current active position, so delayed measurements cannot affect a later word. Clear the notice only on explicit dismissal; never mutate the normalized document.

- [ ] **Step 3: Implement the focus renderer**

Render the active word as before/pivot/after spans. Use a feature-detected `ResizeObserver` when available plus a hidden measurement span or canvas measurement to calculate grapheme widths and call `computePivotOffset`; when `ResizeObserver` is unavailable, measure on mount and window resize. Place the rail at 50% of the reading zone and apply the computed offset. Keep only the active word visible in focus mode. Expose a visually hidden status that announces the active word/section on manual step and pause, and announces only sentence/section changes during autoplay; do not put the rapidly changing visual word itself in a live region.

- [ ] **Step 4: Implement context and long-word renderers**

Use `chooseContextWindow` for optional neighbors and pass `phraseSize`, surface width, rail position, padding, gaps, font scale, and the injected grapheme-aware measurement function. Dim neighbors below active-pivot contrast. Report `{ position: view.activePosition, mode: layout.mode }` through `onRenderedMode` and have the controller ignore stale positions, so long-word hold timing is explicit without changing the one-word stream. Render long-word hold as a complete non-wrapping word sized to the available width, applying the returned `scaleX` with transform origin at the pivot glyph center. Do not permit clipping or horizontal scroll.

- [ ] **Step 5: Implement playback controls**

Add accessible buttons for previous, play/pause, next, restart-current-section-on-error, an actual WPM input/slider, phrase-size control shown only in context mode, progress, chapter metadata, an expanded-mode toggle, and a dismiss action for `state.notice`. Make the actual WPM visible at all times.

- [ ] **Step 6: Implement expanded mode**

Use `ModalLayer` with a full-viewport backdrop that dims the app chrome, traps focus while open, supports Escape, and restores focus to the opener. On reader load, establish a normal `history.replaceState({ reader: true }, "", location.href)`. On expanded entry, call `history.pushState({ reader: true, expanded: true }, "", location.href)` and track that pushed state. Escape, close, or an explicit `setExpanded(false)` calls `history.back()` when the expanded state was pushed; the `popstate` handler then closes the layer without pushing another entry. A Back action while expanded therefore closes the layer first; a second Back leaves the reader. In expanded mode controls fade after inactivity and reappear on pointer/touch/keyboard activity.

- [ ] **Step 7: Add keyboard shortcuts**

Implement Space pause/resume, Left/Right previous/next, Up/Down WPM adjustment, `C` Context peek, and Escape expanded-mode exit. Ignore shortcuts while typing in an input or textarea or while the event target is an interactive control whose native action should win. For a handled global Space event, call `preventDefault()` so a focused play/pause button does not also trigger its native click. Manual step and pause update the accessible status; autoplay updates it only at sentence/section boundaries.

- [ ] **Step 8: Run reader component tests**

Run: `npm test -- --run tests/components/reader-surface.test.tsx`
Expected: PASS for focus default, pivot rendering, controls, expanded exit, initial position restoration, invalid-state recovery, and accessibility announcements.

- [ ] **Step 9: Commit the reader**

```bash
git add src/features/reader src/components/ModalLayer.tsx src/styles/reader.css tests/components/reader-surface.test.tsx
git commit -m "feat: add pivot anchored reader"
```

---

### Task 8: Add settings, persistence recovery, and accessibility states

**Files:**
- Create: `src/features/settings/SettingsDrawer.tsx`
- Modify: `src/domain/settings.ts`
- Modify: `src/features/reader/ReaderPage.tsx`
- Modify: `src/features/reader/ReaderControls.tsx`
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/reader.css`
- Modify: `tests/components/reader-surface.test.tsx`

**Interfaces:**
- `Settings fields: all persisted ReaderSettings fields: wpm, phraseSize, fontScale, contrast, pauseProfile, reducedMotion, and showContextByDefault.`
- `SettingsDrawer` emits `onChange(settings: ReaderSettings)` and `onClose()`.

- [ ] **Step 1: Write failing settings/accessibility tests**

Cover persisted settings loading for every `ReaderSettings` field including WPM and phrase size, storage failure notice, high-contrast class, reduced-motion class, visible focus styles, minimum control labels, and settings drawer Escape/close behavior.

- [ ] **Step 2: Implement the settings drawer**

Provide font scale, contrast, reduced motion, pause profile, context-default, WPM, and phrase-size controls. Save every valid merged settings change—including WPM and phrase size—through the persistence wrapper and keep the reader usable if storage rejects the write; set `state.notice` for the same dismissible non-blocking warning rather than failing the interaction.

- [ ] **Step 3: Add accessibility styling and semantics**

Use `aria-live` for import/playback notices, `aria-pressed` for toggles, `aria-valuenow`/`aria-valuetext` for WPM, `role="dialog"` for settings, visible `:focus-visible`, contrast tokens, and touch target dimensions.

- [ ] **Step 4: Add responsive styles**

Desktop: wide reading zone with compact controls. Mobile: stacked controls, smaller type, no change to rail math. Verify no body or reader horizontal overflow at 320px, 390px, 768px, and 1440px.

- [ ] **Step 5: Run component and accessibility-focused tests**

Run: `npm test -- --run tests/components/reader-surface.test.tsx`
Expected: PASS with settings and state variants covered.

- [ ] **Step 6: Commit settings and accessibility**

```bash
git add src/features/settings src/domain/settings.ts src/features/reader src/styles tests/components/reader-surface.test.tsx
git commit -m "feat: add reader settings and accessible states"
```

---

### Task 9: Apply final editorial visual system and responsive polish

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/styles/reader.css`
- Modify: `src/features/import/ImportPage.tsx`
- Modify: `src/features/reader/ReaderSurface.tsx`
- Create: `public/favicon.svg`

**Interfaces:**
- Preserve all reader and domain APIs from Tasks 1–8.
- Visual changes must not change token order, timing calculations, or pivot offset inputs.

- [ ] **Step 1: Add the approved visual language**

Implement graphite background gradients, warm ivory editorial type, lime pivot/rail, orange pause cues, subtle borders, restrained shadows, and compact uppercase metadata. Keep marketing copy focused on reading rather than training.

- [ ] **Step 2: Match expanded mode behavior**

Dim or hide navigation/import chrome when expanded. Keep only title, close, progress, playback, speed, and mode controls prominent. Fade controls after inactivity without hiding keyboard or screen-reader access.
- [ ] **Step 3: Add the exact desktop/mobile layouts**

Use CSS grid/flex layouts with explicit acceptance at 320px, 390px, 768px, and 1440px: the reading rail remains at 50% of the reading zone, controls remain reachable, body and reader have no horizontal overflow, and long words/context windows remain fully visible without clipping or mid-word wrapping. Match the approved dark editorial tokens rather than relying on an untracked mockup file.

- [ ] **Step 4: Add product metadata**

Set title, description, theme color, canonical relative URL, Open Graph title/description, and favicon. Keep metadata generic enough to work on a project-site path.

- [ ] **Step 5: Run the app locally for visual smoke testing**

Run: `npm run dev -- --host 127.0.0.1`
Exercise in a browser: homepage, pasted text import, focus playback, Context peek, expanded mode, mobile viewport, long-word hold, settings drawer, and Escape/back exit. Capture desktop and mobile screenshots for comparison with the approved visual direction.

- [ ] **Step 6: Commit visual polish**

```bash
git add src/styles src/features/import/ImportPage.tsx src/features/reader/ReaderSurface.tsx public/favicon.svg index.html
git commit -m "feat: polish editorial reader interface"
```

---

### Task 10: Add GitHub Pages deployment and production smoke coverage

**Files:**
- Create: `tests/fixtures/minimal.epub`
- Create: `tests/smoke/pages-path.test.ts`
- Create: `scripts/serve-pages.mjs`
- Modify: `vite.config.ts` only if the build-path test exposes a real base-path issue

**Interfaces:**
- User-site deployment sets `VITE_BASE_PATH=/`; project-site deployment sets `VITE_BASE_PATH=/${{ github.event.repository.name }}/`.
- Build output is `dist/` and is uploaded through the official Pages artifact/deploy actions.
- `npm run preview:smoke` serves `dist` on `127.0.0.1:4173`, strips `PAGES_BASE_PATH` from incoming paths, serves the matching asset with its real MIME type, and falls back to `index.html` only for document navigations; `npm run test:smoke` waits for that URL and runs the Playwright Pages smoke test.

- [ ] **Step 1: Write the Pages-path smoke test**

Use `@playwright/test` with `baseURL: "http://127.0.0.1:4173"` and `process.env.PAGES_BASE_PATH ?? "/speed-reader/"`. Request the base path and assert HTTP 200, verify every script/stylesheet asset URL returns HTTP 200 with a JavaScript/CSS MIME type rather than the HTML fallback, navigate to the hash home route, import `tests/fixtures/minimal.epub` through the real file input, assert the reader main landmark and exact pivot word render, then paste short, uneven, and long sample words through the real textarea. For each rendered focus word, compare the `getBoundingClientRect().center` of `[data-testid="active-pivot"]` with `[data-testid="reader-rail"]` within 1 CSS pixel, and assert `document.scrollingElement.scrollWidth <= document.scrollingElement.clientWidth`. Then paste sample text and assert the same reader path. Run the same test with `PAGES_BASE_PATH=/` for the preferred user-site/custom-domain build and with `/speed-reader/` for the project-site build.

- [ ] **Step 2: Add the GitHub Actions workflow**
Use checkout, setup-node with `cache: "npm"`, `npm ci`, `npx playwright install --with-deps chromium`, `actions/configure-pages`, `npm run build`, `actions/upload-pages-artifact`, and `actions/deploy-pages`. Set the build job environment explicitly: `VITE_BASE_PATH: ${{ github.event.repository.name == format('{0}.github.io', github.repository_owner) && '/' || format('/{0}/', github.event.repository.name) }}` so the preferred user-site repository builds at root and other repositories build at their project path. Trigger on pushes to `main` and workflow dispatch. Grant `contents: read`, `pages: write`, and `id-token: write`; declare the `github-pages` environment and expose the deployment URL. Do not add secrets or runtime APIs.

- [ ] **Step 3: Run the production build and smoke test**
Implement `scripts/serve-pages.mjs` as a small Node HTTP server with no application API: read `PAGES_BASE_PATH`, strip only that prefix, reject traversal, serve files from `dist` with extension-derived MIME types, honor `HEAD`, and fall back to `dist/index.html` only for HTML document requests. Return 404 for missing assets so the smoke test cannot pass on an HTML fallback.

Run both deployment modes; `start-server-and-test` owns server startup, readiness, and cleanup:

```bash
VITE_BASE_PATH=/speed-reader/ npm run build
PAGES_BASE_PATH=/speed-reader/ npm run test:smoke

VITE_BASE_PATH=/ npm run build
PAGES_BASE_PATH=/ npm run test:smoke
```

Expected: each build exits 0, the static server becomes reachable, generated assets use the configured base path, all asset requests return 200, hash routes load in Chromium, and the smoke test passes.



- [ ] **Step 4: Run the complete test suite**

Run: `npm test`
Expected: all unit and component tests pass with no skipped tests.

- [ ] **Step 5: Perform the final real-surface smoke pass**

Against the production preview, import `tests/fixtures/minimal.epub` and one pasted document. Verify desktop and 320px, 390px, 768px, and 1440px behavior, pivot alignment, Context peek fallback, long-word hold, WPM adjustment, refresh persistence, storage-unavailable notice, expanded Escape/back/close exits, and keyboard shortcuts.

- [ ] **Step 6: Commit deployment configuration**

```bash
git add .github/workflows/deploy-pages.yml scripts/serve-pages.mjs tests/fixtures/minimal.epub tests/smoke/pages-path.test.ts vite.config.ts package.json package-lock.json
git commit -m "ci: deploy reader to github pages"
```

---

## Coverage map

- Public landing/import UX: Tasks 1 and 6.
- Pasted text normalization: Task 2.
- EPUB 2/3 spine parsing and unsupported-file errors: Task 3.
- Pivot grapheme center rail: Task 5 and Task 7.
- Context peek and overflow fallback: Tasks 5 and 7.
- WPM/punctuation/boundary timing: Task 5.
- IndexedDB documents, positions, settings, and failure fallback: Tasks 4, 7, and 8.
- Expanded dimmed mode and exit behavior: Tasks 7 and 9.
- Responsive desktop/mobile layout: Tasks 8 and 9.
- Accessibility and reduced motion: Task 8.
- GitHub Pages user-site root and project-site path: Task 10.
- Explicit non-goals (accounts, upload APIs, DRM/OCR/media): enforced by Global Constraints and Tasks 3, 6, and 10.

## Verification gate

Before calling the implementation complete, run the full test suite, the production build, the Pages-path smoke test, and the real-surface desktop/mobile import-and-playback smoke pass. Report the baseline and final test counts, the exact command outputs, the deployed commit state, and any user-only checks that cannot be reproduced in the test environment.
