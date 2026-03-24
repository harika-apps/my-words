import { defineConfig } from 'vite'
import { resolve } from 'path'
import type { Plugin } from 'vite'

// Popup HTML output path'ini src/popup/ → popup/ olarak düzelt
function rewritePopupPath(): Plugin {
  return {
    name: 'rewrite-popup-output',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const key = 'src/popup/popup.html'
      if (bundle[key]) {
        bundle[key].fileName = 'popup/popup.html'
      }
    },
  }
}

export default defineConfig({
  publicDir: 'public',
  build: {
    outDir:      'dist',
    emptyOutDir: true,
    target:      'chrome100',
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        content:    resolve(__dirname, 'src/content.ts'),
        popup:      resolve(__dirname, 'src/popup/popup.html'),
      },
      output: {
        entryFileNames: (chunk) =>
          ['background', 'content'].includes(chunk.name)
            ? '[name].js'
            : 'popup/[name].js',
        chunkFileNames:  'popup/[name].js',
        assetFileNames:  'assets/[name][extname]',
      },
    },
  },
  plugins: [rewritePopupPath()],
})
