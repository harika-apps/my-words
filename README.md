# myWords

> A minimal Chrome extension for saving unknown words and phrases while reading — without interrupting your flow.

Double-click any word, or drag-select a two-word phrase, and it's instantly added to your personal vocabulary list. No popup, no friction.

---

## Features

- **Double-click** a word → saved immediately
- **Drag-select** a two-word phrase (*look up*, *as well*, *break down*) → saved immediately
- **Manual add** — type any word or phrase directly into the popup
- **Pause / Resume** — temporarily disable auto-save; while paused, use right-click → *Save to myWords* instead
- **Select & export** — check individual words, then export only the selected ones
- **Export as TXT or CSV** — plain word list or full metadata (word, date, page title, URL)
- Duplicate detection — same entry is never saved twice
- **Cross-device sync** via `chrome.storage.sync`
- Per-item delete, search filter, and clear all

---

## Usage

| Action | How |
|---|---|
| Save a word | Double-click it on any page |
| Save a two-word phrase | Drag-select it on any page |
| Add manually | Open popup → type in the top input → Enter or Add |
| Pause auto-save | Open popup → click **▶ Active** → turns **⏸ Paused** |
| Save while paused | Select text → right-click → **Save to myWords** |
| Select words to export | Check the checkboxes next to words |
| Export | Click **Export** → choose **TXT** or **CSV** |
| Export selected only | Select words → click **Export selected** → choose format |
| Delete a word | Hover the word → click **×** |
| Search | Type in the search box — filters in real time |

---

## Export formats

**TXT** — one word per line, plain text. Good for flashcard imports, Anki, Quizlet, etc.

```
ephemeral
look up
ubiquitous
```

**CSV** — full metadata per row. Good for spreadsheets or further processing.

```csv
word,saved_at,page_title,page_url
ephemeral,"2025-03-24T10:00:00.000Z","The Atlantic — Language","https://..."
look up,"2025-03-24T10:01:00.000Z","BBC News","https://..."
```

---

## Installation (local)

```bash
git clone https://github.com/your-username/mywords.git
cd mywords
npm install
npm run build
```

In Chrome:

1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `dist/` folder
4. The **myWords** icon appears in your toolbar ✓

---

## Development

```bash
npm run dev      # watch mode — rebuilds on every file change
```

After each rebuild, click **↺** on the extension card at `chrome://extensions/`. For content script changes, also refresh the target page.

---

## Project Structure

```
src/
├── types.ts            # Shared interfaces & message types
├── background.ts       # Service Worker — storage, pause state, context menu
├── content.ts          # Injected into pages — captures dblclick & drag-select
└── popup/
    ├── popup.html      # Popup UI
    └── popup.ts        # Popup logic
public/
├── manifest.json       # MV3 manifest
└── icons/
```

---

## How it works

### Selection detection

Two event listeners, no conflicts:

| Event | When it fires | Accepted |
|---|---|---|
| `dblclick` | Browser auto-selects a word | Exactly 1 word |
| `mouseup` | User finishes a drag-select | Exactly 2 words |

Input over two words is silently ignored. Text is lowercased and stripped of punctuation before saving.

### Pause mode

Pause state is stored in `chrome.storage.local` (device-specific, not synced). The content script keeps a local `isPaused` variable that stays in sync via `chrome.storage.onChanged`. The toolbar badge shows **⏸** when paused. The right-click context menu (*Save to myWords*) is only visible when paused.

### Storage

- Words → `chrome.storage.sync` (~100 KB, synced across devices)
- Pause state → `chrome.storage.local` (per device)
- If the sync quota is ever hit, the oldest 10% of entries are pruned automatically

---

## Tech Stack

- **TypeScript** — fully typed
- **Vite** — multi-entry bundling, watch mode
- **Chrome Extension Manifest V3**

---

## License

MIT
