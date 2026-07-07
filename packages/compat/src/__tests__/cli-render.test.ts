import { describe, test, expect, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { renderLockToMarkdown } from '../cli'
import { buildCompatReport, formatCompatJson, formatCompatMarkdown } from '../report'

// `--render` is a compile-free mode: read an existing lock JSON file (the
// `CompatReport` shape `formatCompatJson` produces) and print
// `formatCompatMarkdown` of it. This round-trips through a real temp file
// (rather than calling formatCompatMarkdown(JSON.parse(...)) directly) so
// the test also exercises renderLockToMarkdown's read + parse + structural
// check, which is the part `--render` actually adds over the formatters.

const tmpDirs: string[] = []

function tmpFile(name: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'compat-render-'))
  tmpDirs.push(dir)
  return path.join(dir, name)
}

afterEach(() => {
  while (tmpDirs.length > 0) {
    rmSync(tmpDirs.pop()!, { recursive: true, force: true })
  }
})

describe('renderLockToMarkdown', () => {
  test('round-trips a report through formatCompatJson → file → renderLockToMarkdown', () => {
    const report = buildCompatReport({
      alpha: {
        'adapter-a': { ok: true, diagnostics: [] },
        'adapter-b': { ok: false, diagnostics: [{ code: 'BF101', severity: 'error', issues: ['https://example.com/1'] }] },
      },
      beta: {
        'adapter-a': { ok: true, diagnostics: [] },
      },
    })

    const lockPath = tmpFile('compat.lock.json')
    writeFileSync(lockPath, formatCompatJson(report))

    const rendered = renderLockToMarkdown(lockPath)
    expect(rendered).toBe(formatCompatMarkdown(report))
  })

  test('missing file throws a clear error', () => {
    expect(() => renderLockToMarkdown('/nonexistent/path/compat.lock.json')).toThrow(/could not read/)
  })

  test('unparseable JSON throws a clear error', () => {
    const lockPath = tmpFile('bad.json')
    writeFileSync(lockPath, '{ not valid json')
    expect(() => renderLockToMarkdown(lockPath)).toThrow(/could not parse/)
  })

  test('valid JSON that is not a CompatReport shape throws a clear error', () => {
    const lockPath = tmpFile('wrong-shape.json')
    writeFileSync(lockPath, JSON.stringify({ foo: 'bar' }))
    expect(() => renderLockToMarkdown(lockPath)).toThrow(/does not look like a CompatReport/)
  })
})
