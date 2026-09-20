import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { INTEGRATIONS_DIR, containerIntegrations } from '../container-integrations'

describe('containerIntegrations', () => {
  const integrations = containerIntegrations()

  test('finds the Container integrations', () => {
    expect(integrations.length).toBeGreaterThan(0)
  })

  test('names a real integration directory, and only ones declaring a container', () => {
    for (const integration of integrations) {
      expect(integration.dir).toBe(join(INTEGRATIONS_DIR, integration.name))
      expect(existsSync(join(integration.dir, 'wrangler.toml'))).toBe(true)
      expect(Array.isArray(integration.config.containers)).toBe(true)
    }
  })

  test('resolves each declared image to a Dockerfile that exists', () => {
    for (const integration of integrations) {
      expect(integration.dockerfiles.length).toBe((integration.config.containers as unknown[]).length)
      for (const dockerfile of integration.dockerfiles) {
        expect(existsSync(dockerfile)).toBe(true)
      }
    }
  })

  test('leaves out an integration with no container (the TypeScript Workers)', () => {
    const names = integrations.map((integration) => integration.name)
    expect(names).not.toContain('hono')
    expect(existsSync(join(INTEGRATIONS_DIR, 'hono', 'wrangler.toml'))).toBe(true)
  })
})
