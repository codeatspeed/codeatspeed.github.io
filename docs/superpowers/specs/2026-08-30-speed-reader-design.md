# Read/Focus Product Design

## Goal

Build a polished, public, mobile-responsive static website that lets people import a compatible EPUB or paste text, then read it through a focused speed-reading surface with a stable pivot-letter fixation point and user-controlled pacing.

The product optimizes for reducing unnecessary eye movement and making faster reading comfortable. It does not present itself as a training program, leaderboard, comprehension test, or guaranteed 5×-speed system.

## Product positioning

The public-facing promise is a calmer, more focused way to read faster. The visual identity is dark editorial: graphite surfaces, warm ivory typography, acid-lime fixation accents, and restrained orange pause cues.

Primary reading behavior:

- Focus mode is the default.
- Only the current word is shown during playback.
- One pivot grapheme is colored and held at a fixed center rail.
- The word is positioned by the pivot glyph's measured center, not by the word box.
- Context peek is optional and shows width-tested neighboring words in a dimmer treatment.
- Punctuation, sentence endings, and paragraph boundaries receive readable pauses.
- WPM and phrase size remain user controls; the UI does not grade the reader.

## Scope

### In scope for v1

- EPUB 2/3 files that contain readable, non-DRM XHTML/text content.
- Pasted plain text.
- Browser-side parsing and normalization.
- Focus mode with pivot-letter anchoring.
- Optional Context peek mode.
- WPM presets including a fast/5× aspiration plus exact WPM adjustment.
- Phrase-size control for Context peek.
- Pause, resume, previous, next, keyboard shortcuts, and progress.
- Responsive desktop and mobile reader surfaces.
- Full-screen expanded mode with dimmed surrounding chrome.
- IndexedDB persistence for imported documents, reading position, and preferences.
- Accessible keyboard, reduced-motion, and high-contrast behavior.
- Static deployment to GitHub Pages.

### Explicitly out of scope for v1

- Accounts, cloud libraries, social sharing, subscriptions, telemetry dashboards, or server-side book storage.
- DRM circumvention.
- OCR for image-only scans.
- Audio/video EPUB playback.
- Claims that every reader will achieve a specific WPM or retain a specific comprehension level.
- Server-side parsing or upload APIs.

## Public site structure

### Landing/import surface

The homepage is an editorial import screen rather than a dashboard. It contains:

- The product mark and one-line promise.
- EPUB drag-and-drop and file-picker input.
- Paste-text entry.
- A sample-text action so the reader can try the experience without finding a book.
- A direct statement that imported content is kept in this browser.
- Help and keyboard-shortcut access.
- A restrained footer with the author's name, source link, and privacy note.

Import errors are local, specific, and recoverable. The UI must distinguish an unreadable file, unsupported EPUB content, empty text, and browser storage failure.

### Reader surface

The reader contains:

- A compact title/chapter header.
- Focus/Context mode control.
- The current word or width-tested context phrase.
- WPM display and direct speed adjustment.
- Phrase-size adjustment when Context mode is active.
- Pause, resume, previous, and next controls.
- Progress indicator.
- Settings drawer for font scale, contrast, pause behavior, and shortcuts.

### Expanded mode

Expanded mode is a full-screen layer entered from the reader. It dims or hides navigation, import actions, and secondary controls. Essential controls remain available but fade until pointer movement, tap, or keyboard input. Escape, browser back, or the close control exits expanded mode.

## Document pipeline

All inputs are converted to one normalized document model before playback:

```ts
Document {
  id: string
  title: string
  author?: string
  sections: Section[]
}

Section {
  id: string
  title?: string
  paragraphs: Paragraph[]
}

Paragraph {
  sentences: Sentence[]
}

Sentence {
  tokens: Token[]
}

Token {
  text: string
  kind: "word" | "punctuation" | "whitespace"
  graphemes: string[]
  pivotIndex: number
  boundaryAfter: "none" | "sentence" | "paragraph" | "section"
  punctuationAfter: string
}
```

### EPUB handling

The browser reads the selected file as an ArrayBuffer. The importer extracts the EPUB ZIP container, resolves `container.xml`, reads the OPF package, follows the spine order, extracts text from XHTML documents, and preserves section/chapter titles where available. Raw imported markup is never mounted as application HTML; text is extracted into the normalized model. The importer rejects an input file over 50 MiB before reading it, limits each decompressed archive entry to 20 MiB and total decompressed content to 200 MiB, and rejects malformed XML, traversal paths, and invalid encoded hrefs.

A compatible EPUB is non-DRM, text-based, and structurally parseable. DRM-protected, image-only, or media-heavy files receive a clear unsupported-content message. Spine items marked `linear="no"` are skipped; an EPUB with no remaining readable text is rejected.

### Text handling

Pasted text is normalized into paragraphs and sentences while preserving meaningful punctuation. Punctuation is attached to the preceding word's `punctuationAfter` metadata for timing and is not shown as a separate playback step. Empty input is rejected with an actionable message. Unicode word and grapheme segmentation uses `Intl.Segmenter` when available and `grapheme-splitter` as the fallback.

## Pivot-letter layout

The layout engine owns the fixation invariant:

> The center of the active pivot grapheme must align with the center rail, and no displayed text may be clipped or horizontally scroll.

For each active word:

1. Segment the word into grapheme clusters so combining marks and emoji are not split.
2. Select a stable pivot grapheme near the visual middle.
3. Render the word as before-pivot-after spans.
4. Measure the rendered spans in the active font and size.
5. Offset the complete word so the pivot glyph's center equals the rail position.

The color treatment applies to the exact pivot grapheme, not the entire word. The rail is a visual guide and must remain visible in high-contrast mode.

### Width fallback

The reader uses this order to keep the surface usable:

```text
fit the selected context phrase
→ reduce context neighbors
→ show the active word only
→ reduce an oversized word to the safe font minimum
→ complete long-word hold with fit-to-width scale
```

The reader must not clip a word, wrap it mid-word, hide letters, or require horizontal scrolling. If a word still exceeds the available width at the safe minimum, the long-word hold applies a horizontal fit scale with its transform origin at the pivot glyph center, briefly slows or pauses, then resumes the normal one-word stream. Context neighbors never change the playback unit or WPM calculation.

## Timing behavior

The timing engine calculates one active-word duration from WPM and applies explicit modifiers:

- punctuation pause
- sentence-end pause
- paragraph/section pause
- long-word hold
- optional smooth acceleration/deceleration

The engine is deterministic for a given settings snapshot and token sequence. Presets are named by feel (steady, fast, 5× aspiration) and always expose the actual WPM. The default 5× aspiration starts at 1000 WPM but is not a promise about any individual reader. The user can pause, resume, step backward, or step forward without losing the persisted position.

## Persistence

IndexedDB stores:

- normalized documents keyed by local ID
- active section/token position
- reader settings
- last-opened document metadata

Persistence is best-effort. If storage is unavailable or quota is exceeded, the reader remains usable in memory and shows a non-blocking notice that progress will not survive refresh.

Use hash routes such as `#/` and `#/read/<local-id>` so direct navigation works on GitHub Pages without rewrite configuration. Prefer a user-site repository named `<github-username>.github.io`, which uses root assets and also works with a custom domain. A project-site repository uses a configured `/<repository-name>/` asset base. Vite builds the static assets. GitHub Actions publishes the build output to Pages.

## Accessibility and responsive behavior

- Semantic controls with accessible names.
- Full keyboard operation.
- Visible focus states.
- Reduced-motion mode disables nonessential transitions.
- High-contrast mode increases rail, pivot, and text contrast.
- Touch targets are at least comfortable mobile size.
- Desktop uses a wide reading surface; mobile collapses controls without changing the fixation algorithm.
- Browser back and Escape have equivalent exit behavior for expanded mode.

## Error and recovery behavior

- Empty paste: explain that text is required and preserve the user's input.
- Unsupported file type: identify that EPUB or plain text is expected.
- Malformed ZIP/container/OPF: identify the EPUB as unreadable and offer paste/sample actions.
- DRM/image-only/media-only content: state that no readable text could be extracted.
- Storage failure: continue in memory and explain the persistence limitation.
- Unexpected playback state: stop safely at the last valid token and offer restart from the current section.

Errors must never expose raw parser stack traces in the public UI.

## Verification criteria

The implementation is acceptable when the following observable behaviors are covered:

- A valid pasted document opens in focus mode.
- A valid EPUB opens in spine order with title/section metadata.
- The pivot grapheme remains aligned to the rail across short, uneven, and long words.
- Context mode never causes clipping or horizontal overflow on desktop or mobile.
- Long words enter the complete-word fallback instead of wrapping or disappearing.
- WPM changes alter playback duration without changing token order.
- Sentence and paragraph boundaries pause predictably.
- Refresh restores a locally persisted document position when IndexedDB is available.
- Storage failure leaves the reader usable and communicates the limitation.
- Expanded mode visibly dims/hides nonessential chrome and can be exited by Escape/back/close.
- Keyboard, reduced-motion, high-contrast, and mobile interactions remain usable.
- The production build loads correctly from a GitHub Pages project-site path.

## Decisions recorded

- Local-first browser processing over upload storage.
- GitHub Pages over a Worker runtime for the static v1.
- Word-only Focus mode over phrase-first playback.
- Exact pivot-grapheme anchoring over whole-word centering.
- Optional Context peek over always-visible neighboring words.
- Adaptive controls as optional tuning, not visible training/scoring.
- No account, backend, or cloud library in v1.
