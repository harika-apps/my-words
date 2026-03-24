import type { Message, VocabEntry } from './types'

const TOAST_ID       = '__mywords_toast__'
const TOAST_DURATION = 1600

// ─── Pause state ──────────────────────────────────────────────────────────────

let isPaused = false

chrome.runtime.sendMessage({ type: 'GET_PAUSED' } as Message, (res) => {
  if (!chrome.runtime.lastError) isPaused = res?.paused ?? false
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'paused' in changes) isPaused = changes['paused'].newValue ?? false
})

// ─── Son cümleyi sakla (sağ tıkla ekleme için, pause modunda da çalışır) ──────

let lastSentence = ''

// ─── Double-click → tek kelime ────────────────────────────────────────────────

document.addEventListener('dblclick', () => {
  const sel = window.getSelection()
  if (!sel) return
  const raw = sel.toString().trim()

  // Pause modunda bile cümleyi sakla — sağ tıkla ekleme bunu kullanır
  lastSentence = extractSentence(sel)

  if (isPaused) return
  const words = tokenize(raw)
  if (words.length !== 1) return
  trySave(buildEntry(words[0], lastSentence))
})

// ─── Mouseup → tam 2-kelime öbek ─────────────────────────────────────────────

document.addEventListener('mouseup', () => {
  const sel = window.getSelection()
  if (!sel) return
  const raw = sel.toString().trim()
  if (!raw) return

  // Pause modunda bile cümleyi sakla
  lastSentence = extractSentence(sel)

  if (isPaused) return
  const words = tokenize(raw)
  if (words.length !== 2) return
  trySave(buildEntry(words.join(' '), lastSentence))
})

// ─── Background'dan gelen mesajları dinle ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  if (msg.type === 'GET_LAST_SENTENCE') {
    sendResponse({ sentence: lastSentence })
    return true
  }
})

// ─── Cümle çıkarma ────────────────────────────────────────────────────────────
//
// Strateji:
//   1. Bilinen kısaltmalardaki noktaları geçici bir placeholder ile değiştir
//      (a.m., Mr., e.g., U.S. gibi)
//   2. [.!?] sınırlarına göre cümle başı/sonu bul
//   3. Placeholder'ları geri al
//
// Bu sayede "The meeting is at 8 a.m. tomorrow." gibi metinlerde
// "a.m." cümle sonu zannedilmez.

const PLACEHOLDER = '\x00'

// Kısaltma pattern'leri — sıra önemli (uzundan kısaya)
const ABBREV_RE = /\b(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Rev|Gen|Sgt|Cpl|Pvt|St|vs|etc|e\.g|i\.e|viz|cf|approx|est|dept|fig|no|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec|a\.m|p\.m|A\.M|P\.M|U\.S|U\.K|U\.S\.A|E\.U)\./g

function maskAbbreviations(text: string): string {
  return text
    // "Mr." "Dr." "a.m." gibi bilinen kısaltmalar
    .replace(ABBREV_RE, (match) => match.replace(/\./g, PLACEHOLDER))
    // Tek büyük harf + nokta: "U.S.A." → her nokta mask'le
    .replace(/\b([A-Z])\./g, '$1' + PLACEHOLDER)
    // Rakam + nokta (liste numaraları): "1. First item"
    .replace(/(\d)\./g, '$1' + PLACEHOLDER)
}

function unmaskAbbreviations(text: string): string {
  return text.split(PLACEHOLDER).join('.')
}

function extractSentence(sel: Selection): string {
  if (sel.rangeCount === 0) return ''

  const range = sel.getRangeAt(0)
  const node  = range.startContainer

  const rawText = node.nodeType === Node.TEXT_NODE
    ? (node.textContent ?? '')
    : (node instanceof Element ? node.innerText : '')

  if (!rawText) return ''

  const masked = maskAbbreviations(rawText)
  const offset = range.startOffset

  // Geriye: cümle başı
  let start = offset
  while (start > 0 && !/[.!?]/.test(masked[start - 1])) start--

  // İleriye: cümle sonu
  let end = offset
  while (end < masked.length && !/[.!?]/.test(masked[end])) end++
  if (end < masked.length) end++

  const sentence = unmaskAbbreviations(masked.slice(start, end))
  return sentence.trim().replace(/\s+/g, ' ').slice(0, 300)
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────

function tokenize(raw: string): string[] {
  if (raw.split(/\s+/).length > 2) return []
  const tokens = raw
    .toLowerCase()
    .split(/\s+/)
    .map(w => w.replace(/[^a-z'\u2019-]/g, '').replace(/^['\u2019]+|['\u2019]+$/g, ''))
    .filter(Boolean)
  return tokens.length <= 2 ? tokens : []
}

function buildEntry(word: string, sentence: string): VocabEntry {
  return { word, sentence, savedAt: Date.now() }
}

function trySave(entry: VocabEntry): void {
  chrome.runtime.sendMessage({ type: 'SAVE_WORD', entry } as Message, (res) => {
    if (chrome.runtime.lastError) return
    if (res?.success) showToast(entry.word)
  })
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function showToast(word: string): void {
  document.getElementById(TOAST_ID)?.remove()
  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.textContent = `✓  ${word}`
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    background: '#18181b', color: '#a3e635',
    padding: '9px 18px', borderRadius: '8px',
    fontSize: '13px', fontFamily: 'system-ui, sans-serif',
    fontWeight: '500', letterSpacing: '0.02em',
    zIndex: '2147483647', boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
    transition: 'opacity 0.25s ease', opacity: '1',
    pointerEvents: 'none', userSelect: 'none',
  } as Partial<CSSStyleDeclaration>)
  document.body.appendChild(toast)
  setTimeout(() => {
    toast.style.opacity = '0'
    setTimeout(() => toast.remove(), 280)
  }, TOAST_DURATION)
}
