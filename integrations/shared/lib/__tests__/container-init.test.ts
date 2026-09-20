import { describe, test, expect } from 'bun:test'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Every Cloudflare Container integration starts its server under `tini`, so
 * the Container class's idle-timeout SIGTERM actually stops it instead of
 * being dropped by a server running as PID 1 -- see "Why production images
 * run under tini" in integrations/README.md.
 *
 * The images are derived from each integration's wrangler.toml
 * `[[containers]]` entries (the image `wrangler deploy` actually builds),
 * never a hand-written list, so a new integration is covered the moment it
 * declares a container.
 */

const INTEGRATIONS_DIR = resolve(import.meta.dir, '../../..')

type Instruction = { keyword: string; args: string }

/** Splits a Dockerfile into instructions, dropping comment lines and joining `\` continuations. */
function parseDockerfile(source: string): Instruction[] {
  const instructions: Instruction[] = []
  let pending = ''
  for (const raw of source.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('#')) continue
    if (line.endsWith('\\')) {
      pending += `${line.slice(0, -1)} `
      continue
    }
    const full = (pending + line).trim()
    pending = ''
    if (full === '') continue
    const keyword = full.split(/\s+/, 1)[0]
    instructions.push({ keyword: keyword.toUpperCase(), args: full.slice(keyword.length).trim() })
  }
  return instructions
}

function containerDockerfiles(): { name: string; dockerfile: string }[] {
  return readdirSync(INTEGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const wranglerToml = join(INTEGRATIONS_DIR, entry.name, 'wrangler.toml')
      if (!existsSync(wranglerToml)) return []
      const config = Bun.TOML.parse(readFileSync(wranglerToml, 'utf8')) as { containers?: { image: string }[] }
      return (config.containers ?? []).map((container) => ({
        name: entry.name,
        dockerfile: resolve(dirname(wranglerToml), container.image),
      }))
    })
}

const images = containerDockerfiles()

describe('Container integration images', () => {
  test('are discovered from wrangler.toml', () => {
    expect(images.length).toBeGreaterThan(0)
  })

  for (const { name, dockerfile } of images) {
    test(`${name}: the final stage runs its server under tini`, () => {
      const instructions = parseDockerfile(readFileSync(dockerfile, 'utf8'))
      const finalStage = instructions.slice(instructions.map((i) => i.keyword).lastIndexOf('FROM'))

      const entrypoint = finalStage.filter((i) => i.keyword === 'ENTRYPOINT').pop()
      expect(entrypoint && JSON.parse(entrypoint.args)).toEqual(['tini', '-g', '--'])

      // The ENTRYPOINT is only as good as the binary behind it: without the
      // install the container cannot start at all.
      const installsTini = finalStage.some((i) => i.keyword === 'RUN' && i.args.split(/\s+/).includes('tini'))
      expect(installsTini).toBe(true)
    })
  }
})
