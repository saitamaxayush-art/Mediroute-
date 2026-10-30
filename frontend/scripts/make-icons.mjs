// Writes the PWA icons (a green cross on a road junction) as PNG, with no dependencies.
import { writeFileSync } from 'node:fs'
import { deflateSync } from 'node:zlib'

const PAPER = [0xf5, 0xf1, 0xea]
const INK = [0x17, 0x17, 0x17]
const GREEN = [0x0b, 0x6b, 0x3a]
const WHITE = [0xff, 0xff, 0xff]

function crc32(buf) {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function icon(size) {
  const u = size / 32
  const px = (x, y) => {
    const cx = x / u
    const cy = y / u
    if (cx >= 9 && cx < 23 && cy >= 9 && cy < 23) {
      if ((Math.abs(cx - 16) < 1.6 && cy >= 11.5 && cy < 20.5) || (Math.abs(cy - 16) < 1.6 && cx >= 11.5 && cx < 20.5)) return WHITE
      return GREEN
    }
    if (Math.abs(cx - 16) < 0.6 || Math.abs(cy - 16) < 0.6) return INK
    return PAPER
  }
  const raw = Buffer.alloc((size * 3 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0
    for (let x = 0; x < size; x++) {
      const c = px(x + 0.5, y + 0.5)
      const o = y * (size * 3 + 1) + 1 + x * 3
      raw[o] = c[0]
      raw[o + 1] = c[1]
      raw[o + 2] = c[2]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

for (const s of [192, 512]) writeFileSync(new URL(`../public/icon-${s}.png`, import.meta.url), icon(s))
console.log('icons written')
