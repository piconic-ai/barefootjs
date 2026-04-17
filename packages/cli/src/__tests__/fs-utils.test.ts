import { describe, test, expect } from 'bun:test'
import { writeIfChanged } from '../lib/fs-utils'
import { mkdtempSync, rmSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('writeIfChanged', () => {
  test('writes when file does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-wic-'))
    try {
      const p = join(dir, 'new.txt')
      expect(await writeIfChanged(p, 'hello')).toBe(true)
      expect(await Bun.file(p).text()).toBe('hello')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('skips write when content matches', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-wic-'))
    try {
      const p = join(dir, 'same.txt')
      await Bun.write(p, 'stable')
      const mtimeBefore = statSync(p).mtimeMs
      // Ensure mtime can differ if a write actually happens
      await new Promise((r) => setTimeout(r, 10))
      expect(await writeIfChanged(p, 'stable')).toBe(false)
      expect(statSync(p).mtimeMs).toBe(mtimeBefore)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('writes when content differs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-wic-'))
    try {
      const p = join(dir, 'diff.txt')
      await Bun.write(p, 'before')
      expect(await writeIfChanged(p, 'after')).toBe(true)
      expect(await Bun.file(p).text()).toBe('after')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('handles ArrayBuffer content', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bf-wic-'))
    try {
      const p = join(dir, 'bytes.bin')
      const bytes = new TextEncoder().encode('binary')
      expect(await writeIfChanged(p, bytes.buffer as ArrayBuffer)).toBe(true)
      expect(await writeIfChanged(p, bytes.buffer as ArrayBuffer)).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
