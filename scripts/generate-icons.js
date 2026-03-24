// Gerçek ikonlar olmadan test edebilmek için placeholder PNG dosyaları oluşturur.
// Production'da bunları gerçek PNG ikonlarla değiştir.

const { createCanvas } = require('canvas')
const fs = require('fs')
const path = require('path')

const sizes = [16, 48, 128]
const outDir = path.join(__dirname, 'public', 'icons')

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

for (const size of sizes) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  // Background
  ctx.fillStyle = '#18181b'
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.15)
  ctx.fill()

  // Letter "V"
  ctx.fillStyle = '#a3e635'
  ctx.font = `bold ${size * 0.6}px serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('V', size / 2, size / 2 + size * 0.04)

  const buffer = canvas.toBuffer('image/png')
  fs.writeFileSync(path.join(outDir, `icon-${size}.png`), buffer)
  console.log(`✓  icon-${size}.png`)
}
