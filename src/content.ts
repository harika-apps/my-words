import type { Message, VocabEntry } from './types'

const TOAST_ID       = '__wordbook_toast__'
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
//   1. Seçimin bulunduğu en yakın blok-seviye parent'ı bul
//      (inline eleman içindeki seçimlerde — bold, italic, link — tam cümleye ulaş)
//   2. Blok elemanın innerText'ini al, seçimin bu metin içindeki offset'ini hesapla
//   3. Akıllı cümle sınırı tespiti:
//      - ! ve ? her zaman cümle sonu
//      - . sadece ardından boşluk + büyük harf/tırnak/sayı geliyorsa
//        veya metnin sonundaysa cümle sonu sayılır
//      - Böylece kısaltma, ondalık sayı, dosya adı vb. cümle kesmez

const BLOCK_TAGS = new Set([
  'P','DIV','LI','TD','TH','BLOCKQUOTE','ARTICLE','SECTION',
  'H1','H2','H3','H4','H5','H6','FIGCAPTION','DD','DT','PRE','BODY',
])

/** Seçim node'undan yukarı çıkarak en yakın blok-seviye parent'ı bulur */
function closestBlock(node: Node): HTMLElement {
  let cur: Node | null = node.nodeType === Node.TEXT_NODE ? node.parentElement : node
  while (cur && cur instanceof HTMLElement) {
    if (BLOCK_TAGS.has(cur.tagName)) return cur
    cur = cur.parentElement
  }
  return document.body
}

/** Blok eleman içinde, belirli bir text node + offset'in düz metin karşılığını bulur */
function flatOffset(block: HTMLElement, targetNode: Node, localOffset: number): number {
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT)
  let total = 0
  while (walker.nextNode()) {
    if (walker.currentNode === targetNode) return total + localOffset
    total += (walker.currentNode.textContent ?? '').length
  }
  return total + localOffset
}

/** Nokta karakterinin gerçek bir cümle sonu olup olmadığını kontrol eder */
function isDotSentenceEnd(text: string, dotIndex: number): boolean {
  // Metnin sonundaki nokta → cümle sonu
  if (dotIndex >= text.length - 1) return true

  const after = text[dotIndex + 1]

  // Noktadan hemen sonra boşluk yoksa → cümle sonu değil (3.5, file.txt vb.)
  if (after !== ' ' && after !== '\n' && after !== '\t' && after !== '\r') return false

  // Noktadan sonra boşluk var — boşluktan sonraki ilk non-space karaktere bak
  let i = dotIndex + 2
  while (i < text.length && /\s/.test(text[i])) i++

  // Boşluktan sonra metin bitti → cümle sonu
  if (i >= text.length) return true

  const firstChar = text[i]

  // Büyük harf, tırnak, parantez, rakam → yeni cümle başlıyor
  if (/[A-Z\u00C0-\u00DC"\u201C\u2018\u00AB([]/.test(firstChar)) return true

  // Noktadan önceki kelimeye bak — tek harf veya bilinen kısaltma mı?
  let ws = dotIndex - 1
  while (ws >= 0 && text[ws] !== ' ' && text[ws] !== '\n') ws--
  const wordBefore = text.slice(ws + 1, dotIndex)

  // Tek harf (A. B. gibi initials) veya bilinen kısaltma → cümle sonu değil
  if (wordBefore.length <= 1) return false
  if (/^(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|Rev|Gen|Sgt|Cpl|Pvt|St|vs|etc|approx|est|dept|fig|no|vol|ch|sec|ed|trans|illus|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/i.test(wordBefore)) return false

  // Noktalı kısaltma (e.g, i.e, a.m, p.m, U.S, vb.)
  if (/^([a-zA-Z]\.)+[a-zA-Z]$/.test(wordBefore)) return false

  // Küçük harfle devam ediyorsa → muhtemelen kısaltma, cümle sonu değil
  return false
}

function isSentenceEnd(text: string, index: number): boolean {
  const ch = text[index]
  if (ch === '!' || ch === '?') return true
  if (ch === '.') return isDotSentenceEnd(text, index)
  return false
}

function extractSentence(sel: Selection): string {
  if (sel.rangeCount === 0) return ''

  const range = sel.getRangeAt(0)
  const node  = range.startContainer

  // Blok-seviye parent'ı bul ve tam metni al
  const block   = closestBlock(node)
  const rawText = block.innerText ?? ''

  if (!rawText) return ''

  // Seçimin blok metin içindeki offset'ini hesapla
  const offset = node.nodeType === Node.TEXT_NODE
    ? flatOffset(block, node, range.startOffset)
    : range.startOffset

  // Geriye: cümle başı
  let start = offset
  while (start > 0 && !isSentenceEnd(rawText, start - 1)) start--

  // İleriye: cümle sonu
  let end = offset
  while (end < rawText.length && !isSentenceEnd(rawText, end)) end++
  if (end < rawText.length) end++ // sonu dahil et

  const sentence = rawText.slice(start, end)
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

  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const bg   = dark ? 'rgba(38, 38, 44, 0.92)' : 'rgba(255, 255, 255, 0.92)'
  const fg   = dark ? '#f2f2f7'                 : '#1c1c1e'
  const border = dark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)'
  const shadow = dark
    ? '0 8px 24px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.07)'
    : '0 8px 24px rgba(0,0,0,0.12), inset 0 0 0 0.5px rgba(255,255,255,0.8)'

  const toast = document.createElement('div')
  toast.id = TOAST_ID
  toast.textContent = `✓  ${word}`

  Object.assign(toast.style, {
    position:       'fixed',
    bottom:         '20px',
    right:          '20px',
    background:     bg,
    color:          fg,
    border:         `1px solid ${border}`,
    padding:        '8px 16px',
    borderRadius:   '99px',
    fontSize:       '12.5px',
    fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight:     '500',
    letterSpacing:  '0.01em',
    zIndex:         '2147483647',
    boxShadow:      shadow,
    backdropFilter: 'blur(12px)',
    webkitBackdropFilter: 'blur(12px)',
    transition:     'opacity 0.25s ease, transform 0.25s ease',
    opacity:        '1',
    transform:      'translateY(0)',
    pointerEvents:  'none',
    userSelect:     'none',
  } as Partial<CSSStyleDeclaration>)

  document.body.appendChild(toast)

  setTimeout(() => {
    toast.style.opacity   = '0'
    toast.style.transform = 'translateY(4px)'
    setTimeout(() => toast.remove(), 280)
  }, TOAST_DURATION)
}
