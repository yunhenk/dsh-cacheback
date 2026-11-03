/**
 * Decoding for DSH's append-only session logs.
 *
 * A compressed session is not one Zstandard frame: the JSONL backend appends
 * one checksummed frame per write batch, and Node's built-in zstd decoder
 * stops after the first frame. The log is therefore split on the Zstandard
 * magic number and every frame is decoded independently. A false magic inside
 * compressed bytes is handled by retrying with the next boundary, and an
 * incomplete trailing frame (the file is being appended while it is read) is
 * skipped instead of failing the whole session.
 *
 * @module dsh-cacheback/decode
 */
import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'

/** Little-endian Zstandard frame magic, `28 B5 2F FD`. */
const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/**
 * Decode every Zstandard frame in a buffer, concatenating their payloads.
 * @param {Buffer} data - a multi-frame zstd file.
 * @returns {{ text: string, frames: number, failedFrames: number }}
 */
export function decodeZstdFrames(data) {
  const offsets = []
  let cursor = 0
  while (cursor < data.length) {
    const found = data.indexOf(ZSTD_MAGIC, cursor)
    if (found < 0) break
    offsets.push(found)
    cursor = found + ZSTD_MAGIC.length
  }

  if (offsets.length === 0) {
    throw new Error('not a zstd session log: no frame magic found')
  }

  const chunks = []
  let failedFrames = 0
  let startIndex = 0

  while (startIndex < offsets.length) {
    let decoded
    let endIndex = startIndex + 1
    // Try the next magic first. If it is a false positive inside compressed
    // data, extend the frame until decoding succeeds.
    for (; endIndex <= offsets.length; endIndex += 1) {
      const start = offsets[startIndex]
      const end = endIndex < offsets.length ? offsets[endIndex] : data.length
      try {
        decoded = zstdDecompressSync(data.subarray(start, end))
        break
      } catch {
        // Keep extending; the next candidate may be the real boundary.
      }
    }

    if (decoded !== undefined) {
      chunks.push(decoded)
      startIndex = endIndex
    } else {
      // A torn or corrupt frame: drop it and continue with the next one.
      failedFrames += 1
      startIndex += 1
    }
  }

  return {
    text: Buffer.concat(chunks).toString('utf8'),
    frames: offsets.length,
    failedFrames,
  }
}

/**
 * Read a session log as JSONL text, transparently decoding zstd.
 * @param {string} file - absolute path to `session*.jsonl` or `.jsonl.zstd`.
 * @returns {Promise<{ text: string, frames: number, failedFrames: number }>}
 */
export async function readSessionLog(file) {
  const data = await readFile(file)
  if (!file.endsWith('.zstd')) {
    return { text: data.toString('utf8'), frames: 0, failedFrames: 0 }
  }
  return decodeZstdFrames(data)
}
