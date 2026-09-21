import { describe, test, expect } from 'bun:test'
import { readFileSync } from 'node:fs'
import { containerIntegrations } from '../../../../scripts/lib/container-integrations'

/**
 * Every Cloudflare Container integration starts its server under `tini`, so
 * the Container class's idle-timeout SIGTERM actually stops it instead of
 * being dropped by a server running as PID 1 -- see "Why production images
 * run under tini" in integrations/README.md.
 *
 * The images come from `containerIntegrations()`, which reads each
 * integration's wrangler.toml -- the same walk the Worker bundle check uses,
 * so "which integrations are Container integrations" has one answer.
 */

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

const images = containerIntegrations().flatMap((integration) =>
  integration.dockerfiles.map((dockerfile) => ({ name: integration.name, dockerfile })),
)

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
