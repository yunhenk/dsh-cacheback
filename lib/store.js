/**
 * Incremental index of parsed sessions, kept next to DSH's home directory.
 *
 * Parsing a large session means decoding thousands of Zstandard frames, so a
 * session is parsed once and reused until its file size or mtime changes. The
 * index is an implementation detail: deleting it only costs one re-scan.
 *
 * @module dsh-cacheback/store
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

/** Bump when the shape of a cached session aggregate changes. */
const INDEX_VERSION = 1

/**
 * Directory for Cacheback's own files.
 * @param {string} home - DSH home.
 * @returns {string} absolute directory.
 */
export function cachebackDir(home) {
  return path.join(home, 'cacheback')
}

/**
 * Load the parse index, treating a missing or unreadable file as empty.
 * @param {string} home - DSH home.
 * @returns {Promise<{ version: number, files: Record<string, { key: string, session: object }> }>}
 */
export async function loadIndex(home) {
  try {
    const raw = await readFile(path.join(cachebackDir(home), 'index.json'), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== INDEX_VERSION || typeof parsed.files !== 'object' || parsed.files === null) {
      return { version: INDEX_VERSION, files: {} }
    }
    return parsed
  } catch {
    return { version: INDEX_VERSION, files: {} }
  }
}

/**
 * Persist the parse index atomically.
 * @param {string} home - DSH home.
 * @param {{ version: number, files: Record<string, unknown> }} index - index to save.
 * @returns {Promise<void>}
 */
export async function saveIndex(home, index) {
  const dir = cachebackDir(home)
  await mkdir(dir, { recursive: true })
  const target = path.join(dir, 'index.json')
  const temporary = `${target}.${process.pid}.tmp`
  await writeFile(temporary, `${JSON.stringify(index)}\n`, 'utf8')
  await rename(temporary, target)
}

/**
 * Remove index entries for sessions that no longer exist.
 * @param {{ files: Record<string, unknown> }} index - parse index.
 * @param {Set<string>} liveFiles - files discovered in this scan.
 * @returns {boolean} whether anything was removed.
 */
export function pruneIndex(index, liveFiles) {
  let removed = false
  for (const file of Object.keys(index.files)) {
    if (!liveFiles.has(file)) {
      delete index.files[file]
      removed = true
    }
  }
  return removed
}
