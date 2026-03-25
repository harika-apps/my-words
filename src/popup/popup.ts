import type { Message, VocabEntry } from '../types'

// ─── DOM refs ─────────────────────────────────────────────────────────────────

const $  = <T extends Element>(s: string) => document.querySelector<T>(s)!

const $list        = $('#list')
const $empty       = $('#empty') as HTMLElement
const $count       = $('#count')
const $pauseBtn    = $<HTMLButtonElement>('#pauseBtn')
const $manualInput = $<HTMLInputElement>('#manualInput')
const $addBtn      = $('#addBtn')
const $exportBtn   = $('#exportBtn')
const $importBtn   = $('#importBtn')
const $importFile  = $<HTMLInputElement>('#importFile')
const $exportTxt   = $('#exportTxt')
const $exportCsv   = $('#exportCsv')
const $cancelExport= $('#cancelExport')
const $selectAll   = $<HTMLInputElement>('#selectAll')
const $selCountLbl = $('#selCount-lbl')
const $notify      = $('#notify') as HTMLElement

// ─── State ────────────────────────────────────────────────────────────────────

let allEntries:   VocabEntry[] = []
let selected:     Set<string>  = new Set()
let isPaused      = false
let exportMode    = false
let notifyTimer:  ReturnType<typeof setTimeout> | null = null

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  const [wordsRes, pausedRes] = await Promise.all([
    send<{ words: VocabEntry[] }>({ type: 'GET_WORDS' }),
    send<{ paused: boolean }>({ type: 'GET_PAUSED' }),
  ])
  allEntries = wordsRes.words ?? []
  isPaused   = pausedRes.paused ?? false
  updatePauseUI()
  render()
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render(): void {
  $count.textContent = `${allEntries.length} word${allEntries.length !== 1 ? 's' : ''}`
  $list.querySelectorAll('.word-item').forEach(el => el.remove())

  if (allEntries.length === 0) {
    $empty.style.display = 'flex'
    updateSelectBar()
    return
  }
  $empty.style.display = 'none'

  allEntries.forEach(entry => {
    const item = document.createElement('div')
    item.className = 'word-item' + (selected.has(entry.word) ? ' selected' : '')
    item.dataset.word = entry.word

    const dateStr = new Date(entry.savedAt).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric',
    })

    item.innerHTML = `
      <input type="checkbox" class="word-cb" ${selected.has(entry.word) ? 'checked' : ''} />
      <div class="word-body">
        <span class="word-text">${escapeHtml(entry.word)}</span>
        ${entry.sentence
          ? `<span class="word-sentence" title="${escapeHtml(entry.sentence)}">${escapeHtml(entry.sentence)}</span>`
          : ''}
      </div>
      <div class="word-meta">
        <span class="word-date">${dateStr}</span>
        <button class="delete-btn" title="Remove">×</button>
      </div>
    `

    item.querySelector<HTMLInputElement>('.word-cb')!.addEventListener('change', e => {
      const cb = e.target as HTMLInputElement
      cb.checked ? selected.add(entry.word) : selected.delete(entry.word)
      item.classList.toggle('selected', cb.checked)
      updateSelectBar()
    })

    item.querySelector('.delete-btn')!.addEventListener('click', e => {
      e.stopPropagation()
      deleteWord(entry.word)
    })

    $list.appendChild(item)
  })

  updateSelectBar()
}

// ─── Export mode toggle ───────────────────────────────────────────────────────

function enterExportMode(): void {
  exportMode = true
  document.body.classList.add('export-mode')
  updateSelectBar()
}

function exitExportMode(): void {
  exportMode = false
  selected.clear()
  document.body.classList.remove('export-mode')
  // uncheck all rendered checkboxes
  $list.querySelectorAll<HTMLInputElement>('.word-cb').forEach(cb => {
    cb.checked = false
  })
  $list.querySelectorAll('.word-item').forEach(el => el.classList.remove('selected'))
  updateSelectBar()
}

function updateSelectBar(): void {
  if (!exportMode) return
  const n = selected.size
  $selCountLbl.textContent = n > 0 ? `${n} selected` : ''

  const allChecked = allEntries.length > 0 && allEntries.every(e => selected.has(e.word))
  $selectAll.checked       = allChecked
  $selectAll.indeterminate = !allChecked && n > 0
}

// ─── Pause toggle ─────────────────────────────────────────────────────────────

function updatePauseUI(): void {
  $pauseBtn.textContent = isPaused ? '⏸' : '▶'
  $pauseBtn.classList.toggle('paused', isPaused)
  $pauseBtn.title = isPaused ? 'Paused — click to resume' : 'Active — click to pause'
}

async function togglePause(): Promise<void> {
  isPaused = !isPaused
  await send({ type: 'SET_PAUSED', paused: isPaused })
  updatePauseUI()
  notify(isPaused ? 'Paused — use right-click to save' : 'Auto-save resumed')
}

// ─── Manual add ───────────────────────────────────────────────────────────────

async function addManual(): Promise<void> {
  const raw = $manualInput.value.trim()
  if (!raw) return
  $manualInput.classList.remove('error')

  const res = await send<{ success: boolean; duplicate?: boolean; error?: string }>(
    { type: 'ADD_WORD_MANUAL', word: raw }
  )

  if (res.success) {
    $manualInput.value = ''
    allEntries = (await send<{ words: VocabEntry[] }>({ type: 'GET_WORDS' })).words ?? []
    render()
    notify(`"${raw.toLowerCase()}" added`)
  } else if (res.duplicate) {
    notify('Already in your list')
    flashError($manualInput)
  } else {
    notify('Use 1–2 words only')
    flashError($manualInput)
  }
}

function flashError(el: HTMLInputElement): void {
  el.classList.add('error')
  setTimeout(() => el.classList.remove('error'), 1200)
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteWord(word: string): Promise<void> {
  selected.delete(word)
  await send({ type: 'DELETE_WORD', word })
  allEntries = allEntries.filter(e => e.word !== word)
  render()
}

// ─── Export ───────────────────────────────────────────────────────────────────

function getExportEntries(): VocabEntry[] {
  return selected.size > 0
    ? allEntries.filter(e => selected.has(e.word))
    : allEntries
}

function exportAs(format: 'txt' | 'csv'): void {
  const entries = getExportEntries()
  if (entries.length === 0) { notify('Nothing to export'); return }

  let content: string
  let mime: string
  let ext: string

  if (format === 'txt') {
    content = entries.map(e => e.word).join('\n')
    mime    = 'text/plain'
    ext     = 'txt'
  } else {
    const header = 'word,sentence,date'
    const rows   = entries.map(e =>
      [e.word, e.sentence, new Date(e.savedAt).toISOString().slice(0, 10)]
        .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(',')
    )
    content = [header, ...rows].join('\n')
    mime    = 'text/csv'
    ext     = 'csv'
  }

  download(content, mime, `wordbook-${dateStamp()}.${ext}`)
  notify(`Exported ${entries.length} word${entries.length !== 1 ? 's' : ''} as .${ext}`)
  exitExportMode()
}

// ─── Import ───────────────────────────────────────────────────────────────────

function openImport(): void {
  $importFile.value = ''
  $importFile.click()
}

async function handleImportFile(file: File): Promise<void> {
  const text = await file.text()
  let entries: VocabEntry[]

  if (file.name.endsWith('.csv')) {
    entries = parseCsv(text)
  } else {
    entries = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
      .map(word => ({ word: word.toLowerCase(), sentence: '', savedAt: Date.now() }))
  }

  if (entries.length === 0) { notify('No valid entries found'); return }

  const res = await send<{ added: number }>({ type: 'IMPORT_WORDS', entries })
  allEntries = (await send<{ words: VocabEntry[] }>({ type: 'GET_WORDS' })).words ?? []
  render()
  notify(
    res.added > 0
      ? `Imported ${res.added} new word${res.added !== 1 ? 's' : ''}`
      : 'All words already in your list'
  )
}

function parseCsv(raw: string): VocabEntry[] {
  const lines = raw.split(/\r?\n/).filter(Boolean)
  if (lines.length < 2) return []

  const header      = lines[0].toLowerCase().split(',').map(h => h.replace(/"/g,'').trim())
  const wordIdx     = header.indexOf('word')
  const sentenceIdx = header.indexOf('sentence')
  const dateIdx     = header.indexOf('date')
  const dataLines   = wordIdx >= 0 ? lines.slice(1) : lines

  return dataLines.map(line => {
    const cols     = splitCsvLine(line)
    const word     = (wordIdx >= 0 ? cols[wordIdx] : cols[0])?.toLowerCase().trim() ?? ''
    if (!word) return null
    const sentence = sentenceIdx >= 0 ? (cols[sentenceIdx] ?? '') : ''
    const dateStr  = dateIdx     >= 0 ? (cols[dateIdx]     ?? '') : ''
    const savedAt  = dateStr ? (new Date(dateStr).getTime() || Date.now()) : Date.now()
    return { word, sentence, savedAt } satisfies VocabEntry
  }).filter((e): e is VocabEntry => e !== null && e.word.length > 0)
}

function splitCsvLine(line: string): string[] {
  const result: string[] = []
  let cur = ''; let inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (inQ && line[i+1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (ch === ',' && !inQ) { result.push(cur.trim()); cur = '' }
    else cur += ch
  }
  result.push(cur.trim())
  return result
}

// ─── Event listeners ─────────────────────────────────────────────────────────

$pauseBtn   .addEventListener('click',   () => togglePause())
$addBtn     .addEventListener('click',   () => addManual())
$manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') addManual() })
$exportBtn  .addEventListener('click',   () => enterExportMode())
$cancelExport.addEventListener('click',  () => exitExportMode())
$exportTxt  .addEventListener('click',   () => exportAs('txt'))
$exportCsv  .addEventListener('click',   () => exportAs('csv'))
$importBtn  .addEventListener('click',   () => openImport())
$importFile .addEventListener('change',  () => {
  const file = $importFile.files?.[0]
  if (file) handleImportFile(file)
})
$selectAll.addEventListener('change', () => {
  if ($selectAll.checked) allEntries.forEach(e => selected.add(e.word))
  else selected.clear()
  // sync rendered checkboxes
  $list.querySelectorAll<HTMLInputElement>('.word-cb').forEach((cb, i) => {
    const word = allEntries[i]?.word
    cb.checked = word ? selected.has(word) : false
  })
  $list.querySelectorAll('.word-item').forEach((item) => {
    const word = (item as HTMLElement).dataset.word ?? ''
    item.classList.toggle('selected', selected.has(word))
  })
  updateSelectBar()
})

// ─── Utils ────────────────────────────────────────────────────────────────────

function send<T = unknown>(msg: Message): Promise<T> {
  return new Promise(resolve => chrome.runtime.sendMessage(msg, resolve))
}

function download(content: string, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  URL.revokeObjectURL(url)
}

function escapeHtml(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function notify(msg: string): void {
  $notify.textContent = msg
  $notify.classList.add('show')
  if (notifyTimer) clearTimeout(notifyTimer)
  notifyTimer = setTimeout(() => $notify.classList.remove('show'), 1800)
}

// ─── Boot ─────────────────────────────────────────────────────────────────────

init()
