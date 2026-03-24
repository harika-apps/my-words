export interface VocabEntry {
  word:     string
  sentence: string
  savedAt:  number
}

export type Message =
  | { type: 'SAVE_WORD';        entry: VocabEntry }
  | { type: 'GET_WORDS' }
  | { type: 'DELETE_WORD';      word: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'GET_PAUSED' }
  | { type: 'SET_PAUSED';       paused: boolean }
  | { type: 'ADD_WORD_MANUAL';  word: string }
  | { type: 'IMPORT_WORDS';     entries: VocabEntry[] }
  | { type: 'GET_LAST_SENTENCE' }   // background → content script
