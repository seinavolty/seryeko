/**
 * Melolo / CENC AES-CTR progressive MP4 decrypt (client-side).
 * Adapted from Melolo's official player (melolo-decrypt.js).
 */

function readU32(buf, off) {
  return ((buf[off] << 24) | (buf[off + 1] << 16) | (buf[off + 2] << 8) | buf[off + 3]) >>> 0
}

function readU64(buf, off) {
  return readU32(buf, off) * 0x100000000 + readU32(buf, off + 4)
}

function writeTag(buf, off, tag) {
  for (let i = 0; i < 4; i += 1) buf[off + i] = tag.charCodeAt(i)
}

function readTag(buf, off) {
  return String.fromCharCode(buf[off], buf[off + 1], buf[off + 2], buf[off + 3])
}

function iterBoxes(buf, start, end) {
  const boxes = []
  let off = start
  while (off + 8 <= end) {
    const size = readU32(buf, off)
    if (size < 8 || off + size > end) break
    boxes.push({ offset: off, size, tag: readTag(buf, off + 4), bodyOff: off + 8 })
    off += size
  }
  return boxes
}

function findBox(buf, start, end, tag) {
  for (const b of iterBoxes(buf, start, end)) if (b.tag === tag) return b
  return null
}

function walkPath(buf, start, end, ...tags) {
  let s = start
  let e = end
  let found = null
  for (const tag of tags) {
    found = null
    for (const b of iterBoxes(buf, s, e)) {
      if (b.tag === tag) {
        found = b
        s = b.bodyOff
        e = b.offset + b.size
        break
      }
    }
    if (!found) return null
  }
  return found
}

function parseSampleTable(buf, stblStart, stblEnd) {
  const find = (tag) => findBox(buf, stblStart, stblEnd, tag)
  const stsz = find('stsz')
  const stsc = find('stsc')
  const stco = find('stco')
  const co64 = find('co64')
  const senc = find('senc')
  if (!stsz || !stsc || (!stco && !co64)) return null

  const defaultSz = readU32(buf, stsz.bodyOff + 4)
  const n = readU32(buf, stsz.bodyOff + 8)
  const sizes = new Array(n)
  if (defaultSz === 0) {
    for (let i = 0; i < n; i += 1) sizes[i] = readU32(buf, stsz.bodyOff + 12 + i * 4)
  } else {
    sizes.fill(defaultSz)
  }

  let chunkOffs
  if (stco) {
    const cnt = readU32(buf, stco.bodyOff + 4)
    chunkOffs = new Array(cnt)
    for (let i = 0; i < cnt; i += 1) chunkOffs[i] = readU32(buf, stco.bodyOff + 8 + i * 4)
  } else {
    const cnt = readU32(buf, co64.bodyOff + 4)
    chunkOffs = new Array(cnt)
    for (let i = 0; i < cnt; i += 1) chunkOffs[i] = readU64(buf, co64.bodyOff + 8 + i * 8)
  }

  const ne = readU32(buf, stsc.bodyOff + 4)
  const entries = []
  for (let i = 0; i < ne; i += 1) {
    entries.push({
      firstChunk: readU32(buf, stsc.bodyOff + 8 + i * 12),
      spc: readU32(buf, stsc.bodyOff + 12 + i * 12),
    })
  }

  const sampleOffs = []
  let si = 0
  for (let ci = 0; ci < chunkOffs.length && si < n; ci += 1) {
    let spc = 1
    for (const e of entries) {
      if (ci + 1 >= e.firstChunk) spc = e.spc
      else break
    }
    let cur = chunkOffs[ci]
    for (let k = 0; k < spc && si < n; k += 1) {
      sampleOffs.push(cur)
      cur += sizes[si]
      si += 1
    }
  }

  const ivs = []
  const subsamples = []
  if (senc) {
    const flags = (buf[senc.bodyOff + 1] << 16) | (buf[senc.bodyOff + 2] << 8) | buf[senc.bodyOff + 3]
    const cnt = readU32(buf, senc.bodyOff + 4)
    let off = senc.bodyOff + 8
    for (let i = 0; i < cnt; i += 1) {
      ivs.push(new Uint8Array(buf.buffer, buf.byteOffset + off, 8).slice())
      off += 8
      if (flags & 0x02) {
        const subCount = (buf[off] << 8) | buf[off + 1]
        off += 2
        const ranges = []
        for (let s = 0; s < subCount; s += 1) {
          const clearB = (buf[off] << 8) | buf[off + 1]
          const encB = readU32(buf, off + 2)
          off += 6
          ranges.push([clearB, encB])
        }
        subsamples.push(ranges)
      } else {
        subsamples.push(null)
      }
    }
  }
  return { sampleOffs, sizes, ivs, subsamples }
}

function parseAllTracks(buf, moov) {
  const tracks = []
  for (const trak of iterBoxes(buf, moov.bodyOff, moov.offset + moov.size)) {
    if (trak.tag !== 'trak') continue
    const mdia = walkPath(buf, trak.bodyOff, trak.offset + trak.size, 'mdia')
    if (!mdia) continue
    const hdlr = walkPath(buf, mdia.bodyOff, mdia.offset + mdia.size, 'hdlr')
    if (!hdlr) continue
    const handler = readTag(buf, hdlr.offset + 16)
    if (handler !== 'vide' && handler !== 'soun') continue
    const stbl = walkPath(buf, mdia.bodyOff, mdia.offset + mdia.size, 'minf', 'stbl')
    if (!stbl) continue
    const track = parseSampleTable(buf, stbl.bodyOff, stbl.offset + stbl.size)
    if (track && track.ivs.length > 0) tracks.push(track)
  }
  return tracks
}

async function decryptSampleSafe(cryptoKey, iv8, sampleBytes, ranges) {
  if (!ranges || !ranges.length) {
    const counter = new Uint8Array(16)
    counter.set(iv8, 0)
    const dec = await crypto.subtle.decrypt(
      { name: 'AES-CTR', counter, length: 64 },
      cryptoKey,
      sampleBytes,
    )
    return new Uint8Array(dec)
  }
  // CENC subsample: CTR only over protected bytes (clear AAC/NALU headers stay intact)
  let totalEnc = 0
  for (const [, encB] of ranges) totalEnc += encB
  const encBuf = new Uint8Array(totalEnc)
  let epos = 0
  let spos = 0
  for (const [clearB, encB] of ranges) {
    spos += clearB
    if (encB) {
      encBuf.set(sampleBytes.subarray(spos, spos + encB), epos)
      epos += encB
      spos += encB
    }
  }
  const counter = new Uint8Array(16)
  counter.set(iv8, 0)
  const decEnc = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-CTR', counter, length: 64 }, cryptoKey, encBuf),
  )
  const out = new Uint8Array(sampleBytes.length)
  spos = 0
  epos = 0
  for (const [clearB, encB] of ranges) {
    if (clearB) {
      out.set(sampleBytes.subarray(spos, spos + clearB), spos)
      spos += clearB
    }
    if (encB) {
      out.set(decEnc.subarray(epos, epos + encB), spos)
      spos += encB
      epos += encB
    }
  }
  if (spos < sampleBytes.length) out.set(sampleBytes.subarray(spos), spos)
  return out
}

function decryptBatchNative(buf, track, cryptoKey, from, to) {
  const promises = new Array(to - from)
  for (let i = from; i < to; i += 1) {
    const off = track.sampleOffs[i]
    const sz = track.sizes[i]
    const sample = new Uint8Array(buf.buffer, buf.byteOffset + off, sz).slice()
    const ranges = track.subsamples?.[i] || null
    promises[i - from] = decryptSampleSafe(cryptoKey, track.ivs[i], sample, ranges).then((dec) => {
      buf.set(dec, off)
    })
  }
  return Promise.all(promises)
}

function neutralizeDRM(buf, moovStart, moovEnd) {
  const rename = {
    encv: 'hvc1',
    enca: 'mp4a',
    sinf: 'free',
    schm: 'free',
    schi: 'free',
    senc: 'free',
    saio: 'free',
    saiz: 'free',
    tenc: 'free',
    frma: 'free',
    pssh: 'free',
  }
  for (let i = moovStart + 4; i + 4 <= moovEnd; i += 1) {
    const tag = readTag(buf, i)
    if (tag in rename) {
      const sz = readU32(buf, i - 4)
      if (sz >= 8 && sz <= moovEnd - i + 4) writeTag(buf, i, rename[tag])
    }
  }
  let off = 0
  while (off + 8 <= buf.length) {
    const sz = readU32(buf, off)
    if (sz < 8 || off + sz > buf.length) break
    if (readTag(buf, off + 4) === 'pssh') writeTag(buf, off + 4, 'free')
    off += sz
  }
}

/** True when a Melolo-style DRM key should be applied before <video> playback. */
export function needsDrmDecrypt(url, drmKey) {
  if (!drmKey || typeof drmKey !== 'string' || drmKey.length < 32) return false
  if (!url) return false
  const lower = url.toLowerCase()
  return (
    lower.includes('melolostatic.com')
    || lower.includes('mime_type=video')
    || Boolean(drmKey)
  )
}

/**
 * Fetch CDN MP4 and decrypt AES-CTR samples in place.
 * @returns {Promise<Blob>} clear video/mp4 blob
 */
export async function decryptMeloloMp4(cdnURL, keyHex, onProgress) {
  const log = onProgress || (() => {})
  if (!cdnURL || !keyHex) throw new Error('Missing URL or key')
  if (!crypto?.subtle) throw new Error('WebCrypto unavailable')

  const keyBytes = new Uint8Array(keyHex.match(/.{1,2}/g).map((h) => parseInt(h, 16)))
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-CTR' }, false, ['decrypt'])

  log('fetch', 'Downloading encrypted video…')
  const resp = await fetch(cdnURL)
  if (!resp.ok) throw new Error(`CDN ${resp.status}`)
  const total = parseInt(resp.headers.get('Content-Length') || '0', 10)
  const reader = resp.body.getReader()

  let buf = total > 0 ? new Uint8Array(total) : null
  const fallbackChunks = total > 0 ? null : []
  let received = 0

  let moovParsed = false
  let moovBox = null
  let tracks = null
  const decUp = []
  const inFlight = []
  let lastOverlap = 0
  const OVERLAP_BATCH = 50

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (buf) buf.set(value, received)
    else fallbackChunks.push(value)
    received += value.length

    const pct = total > 0 ? Math.round((received / total) * 100) : 0
    const mb = (received / 1048576).toFixed(1)

    if (!moovParsed && buf && received > 512) {
      const moov = walkPath(buf, 0, received, 'moov')
      if (moov && moov.offset + moov.size <= received) {
        moovParsed = true
        moovBox = moov
        tracks = parseAllTracks(buf, moov)
        tracks.forEach(() => decUp.push(0))
      }
    }

    if (moovParsed && tracks && Date.now() - lastOverlap > 30) {
      for (let ti = 0; ti < tracks.length; ti += 1) {
        const t = tracks[ti]
        const cnt = Math.min(t.sampleOffs.length, t.ivs.length)
        let avail = decUp[ti]
        while (avail < cnt && t.sampleOffs[avail] + t.sizes[avail] <= received) avail += 1
        if (avail - decUp[ti] >= OVERLAP_BATCH) {
          inFlight.push(decryptBatchNative(buf, t, cryptoKey, decUp[ti], avail))
          decUp[ti] = avail
          lastOverlap = Date.now()
        }
      }
      log('fetch', `${pct}% (${mb}MB) decrypting…`)
    } else {
      log('fetch', `${pct}% (${mb}MB)`)
    }
  }

  if (!buf) {
    buf = new Uint8Array(received)
    let pos = 0
    for (const c of fallbackChunks) {
      buf.set(c, pos)
      pos += c.length
    }
  }

  if (!moovParsed) {
    log('decrypt', 'Parsing…')
    const moov = walkPath(buf, 0, buf.length, 'moov')
    if (!moov) throw new Error('No moov')
    moovBox = moov
    tracks = parseAllTracks(buf, moov)
    tracks.forEach(() => decUp.push(0))
  }

  if (!tracks || tracks.length === 0) throw new Error('No encrypted tracks')

  let totalSamples = 0
  let doneSamples = 0
  for (let ti = 0; ti < tracks.length; ti += 1) {
    const t = tracks[ti]
    const cnt = Math.min(t.sampleOffs.length, t.ivs.length)
    totalSamples += cnt
    doneSamples += decUp[ti]
    const BATCH = 500
    for (let start = decUp[ti]; start < cnt; start += BATCH) {
      const end = Math.min(start + BATCH, cnt)
      inFlight.push(decryptBatchNative(buf, t, cryptoKey, start, end))
    }
  }

  if (doneSamples > 0) {
    log('decrypt', `${Math.round((doneSamples / totalSamples) * 100)}% overlap, finishing…`)
  } else {
    log('decrypt', `Decrypting ${totalSamples} samples…`)
  }

  if (inFlight.length > 0) await Promise.all(inFlight)

  log('neutralize', 'Finalizing…')
  const moovRef = moovBox || walkPath(buf, 0, buf.length, 'moov')
  if (moovRef) neutralizeDRM(buf, moovRef.offset, moovRef.offset + moovRef.size)

  log('done', 'Ready')
  return new Blob([buf], { type: 'video/mp4' })
}
