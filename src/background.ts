import type { Message, VocabEntry } from './types'

// ─── Storage ──────────────────────────────────────────────────────────────────

async function getEntries(): Promise<VocabEntry[]> {
  const r = await chrome.storage.sync.get(['vocab'])
  return r.vocab ?? []
}

async function saveEntry(entry: VocabEntry): Promise<{ success: boolean; duplicate?: boolean }> {
  const entries = await getEntries()
  if (entries.some(e => e.word === entry.word)) return { success: false, duplicate: true }
  entries.unshift(entry)
  try {
    await chrome.storage.sync.set({ vocab: entries })
  } catch (err) {
    if (String(err).includes('QUOTA')) {
      await chrome.storage.sync.set({ vocab: entries.slice(0, Math.floor(entries.length * 0.9)) })
    } else throw err
  }
  return { success: true }
}

async function deleteEntry(word: string): Promise<void> {
  const entries = await getEntries()
  await chrome.storage.sync.set({ vocab: entries.filter(e => e.word !== word) })
}

async function importEntries(incoming: VocabEntry[]): Promise<{ added: number }> {
  const existing     = await getEntries()
  const existingWords = new Set(existing.map(e => e.word))
  const fresh        = incoming.filter(e => e.word && !existingWords.has(e.word))
  if (fresh.length === 0) return { added: 0 }
  const merged = [...fresh, ...existing]
  try {
    await chrome.storage.sync.set({ vocab: merged })
  } catch (err) {
    if (String(err).includes('QUOTA')) {
      await chrome.storage.sync.set({ vocab: merged.slice(0, Math.floor(merged.length * 0.9)) })
    } else throw err
  }
  return { added: fresh.length }
}

// ─── Pause state ──────────────────────────────────────────────────────────────

async function getPaused(): Promise<boolean> {
  const r = await chrome.storage.local.get(['paused'])
  return r.paused ?? false
}

async function setPaused(paused: boolean): Promise<void> {
  await chrome.storage.local.set({ paused })
  updateContextMenu(paused)
  chrome.action.setBadgeText({ text: paused ? '⏸' : '' })
  chrome.action.setBadgeBackgroundColor({ color: '#71717a' })
}

// ─── Context menu ─────────────────────────────────────────────────────────────

const MENU_ID = 'mywords-save'

function createContextMenu(): void {
  chrome.contextMenus.create({
    id: MENU_ID, title: 'Save to myWords',
    contexts: ['selection'], visible: false,
  })
}

function updateContextMenu(paused: boolean): void {
  chrome.contextMenus.update(MENU_ID, { visible: paused })
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID) return
  const raw = info.selectionText?.trim()
  if (!raw) return

  const words = tokenizeBg(raw)
  if (words.length === 0 || words.length > 2) return
  const word = words.join(' ')

  // Content script'ten cümleyi iste
  if (tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'GET_LAST_SENTENCE' } as Message, (res) => {
      const sentence = (!chrome.runtime.lastError && res?.sentence) ? res.sentence : ''
      saveEntry({ word, sentence, savedAt: Date.now() })
    })
  } else {
    saveEntry({ word, sentence: '', savedAt: Date.now() })
  }
})

function tokenizeBg(raw: string): string[] {
  return raw
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z'\u2019-]/g, '').replace(/^['\u2019]+|['\u2019]+$/g, ''))
    .filter(Boolean)
}

// ─── Init ─────────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async () => {
  createContextMenu()
  const paused = await getPaused()
  updateContextMenu(paused)
  if (paused) chrome.action.setBadgeText({ text: '⏸' })
})

chrome.runtime.onStartup.addListener(() => {
  createContextMenu()
  getPaused().then(updateContextMenu)
})

// ─── Message listener ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  switch (message.type) {

    case 'SAVE_WORD':
      saveEntry(message.entry)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err) }))
      return true

    case 'ADD_WORD_MANUAL': {
      const words = tokenizeBg(message.word)
      if (words.length === 0 || words.length > 2) {
        sendResponse({ success: false, error: 'invalid' }); return true
      }
      saveEntry({ word: words.join(' '), sentence: '', savedAt: Date.now() })
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ success: false, error: String(err) }))
      return true
    }

    case 'GET_WORDS':
      getEntries()
        .then(words => sendResponse({ words }))
        .catch(err  => sendResponse({ error: String(err) }))
      return true

    case 'DELETE_WORD':
      deleteEntry(message.word)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ error: String(err) }))
      return true

    case 'CLEAR_ALL':
      chrome.storage.sync.set({ vocab: [] })
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ error: String(err) }))
      return true

    case 'GET_PAUSED':
      getPaused()
        .then(paused => sendResponse({ paused }))
        .catch(err   => sendResponse({ error: String(err) }))
      return true

    case 'SET_PAUSED':
      setPaused(message.paused)
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ error: String(err) }))
      return true

    case 'IMPORT_WORDS':
      importEntries(message.entries)
        .then(res => sendResponse(res))
        .catch(err => sendResponse({ added: 0, error: String(err) }))
      return true
  }
})
