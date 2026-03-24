# myWords

> A minimal Chrome extension for saving unknown words and phrases while reading — without interrupting your flow.

Double-click any word, or drag-select a two-word phrase, and it's instantly added to your personal vocabulary list. No popup, no form, no friction.

---

## Features

- **Double-click** a word → saved immediately
- **Drag-select** a two-word phrase (e.g. *look up*, *as well*, *break down*) → saved immediately
- Unobtrusive toast confirmation — no popups, no modals
- Duplicate detection — same entry is never saved twice
- **Synced across devices** via `chrome.storage.sync`
- Popup panel with search, per-item delete, clear all, and plain-text export

---

## Demo

| Action | Result |
|---|---|
| Double-click a word | ✓ &nbsp;word — green toast appears |
| Drag-select two words | ✓ &nbsp;look up — green toast appears |
| Click the extension icon | Opens your saved word list |
| Type in the search box | Filters the list instantly |
| Click Export | Downloads `vocab-YYYY-MM-DD.txt` |

---

## Installation (local)

```bash
git clone https://github.com/harika-apps/my-words.git
cd my-words
npm install
npm run build
```

Then in Chrome:

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. The extension icon appears in your toolbar ✓

---

## Development

```bash
npm run dev      # watch mode — rebuilds on every file change
```

After each rebuild, click the **↺ refresh** icon on the extension card at `chrome://extensions/`. For content script changes, also refresh the target page.

---

## Project Structure

```
src/
├── types.ts          # Shared interfaces (VocabEntry, Message)
├── background.ts     # Service Worker — storage read/write
├── content.ts        # Injected into pages — captures selections
└── popup/
    ├── popup.html    # Extension popup UI
    └── popup.ts      # Popup logic (list, search, export)
public/
├── manifest.json     # Extension manifest (MV3)
└── icons/            # PNG icons (16, 48, 128px)
```

---

## Tech Stack

- **TypeScript** — fully typed throughout
- **Vite** — fast builds, multi-entry bundling
- **Chrome Extension Manifest V3**
- **`chrome.storage.sync`** — automatic cross-device sync

---

## How selection works

Two independent event listeners handle different cases without conflicting:

| Event | Triggers when | Accepted input |
|---|---|---|
| `dblclick` | Browser auto-selects a word | Exactly 1 word |
| `mouseup` | User finishes a drag-select | Exactly 2 words |

Phrases over two words are silently ignored. Each token is lowercased and stripped of punctuation before saving, so `"don't"` saves as `don't` and `"Look up,"` saves as `look up`.

---

## Storage

Words are stored in `chrome.storage.sync` — Chrome's built-in synced key-value store.

- ~100 KB total capacity (comfortably holds thousands of words)
- Syncs automatically when signed into Chrome across devices
- If the quota is ever reached, the oldest 10% of entries are pruned automatically

---

## License

MIT
