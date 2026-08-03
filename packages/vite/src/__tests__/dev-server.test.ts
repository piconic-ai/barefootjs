import { describe, test, expect } from 'bun:test'
import type { ViteDevServer } from 'vite'
import {
  DEFAULT_DEV_CORS_ORIGIN,
  DEV_ARTIFACT_MARKER_CONTENT,
  DEV_ARTIFACT_MARKER_FILENAME,
  devModuleUrl,
  devRequestPath,
  devScriptAssets,
  resolveDevOrigin,
} from '../dev-server.ts'

describe('devRequestPath', () => {
  test('a file under root becomes a root-relative path, no leading slash', () => {
    expect(devRequestPath({ root: '/proj/app' }, '/proj/app/src/components/Counter.tsx')).toBe(
      'src/components/Counter.tsx',
    )
  })

  test('a file OUTSIDE root uses the /@fs/ absolute-path passthrough (no leading slash)', () => {
    // The realistic layout this plugin has to support: an app's
    // `vite.config.ts` root is the backend app dir, while `components`
    // lives in a sibling `ui/`-style directory.
    expect(devRequestPath({ root: '/proj/app' }, '/proj/ui/components/Counter.tsx')).toBe(
      '@fs/proj/ui/components/Counter.tsx',
    )
  })

  test('root itself resolves to the empty path', () => {
    expect(devRequestPath({ root: '/proj/app' }, '/proj/app')).toBe('')
  })
})

describe('devModuleUrl', () => {
  test('joins origin + base + request path for an in-root file', () => {
    expect(
      devModuleUrl({ root: '/proj/app', base: '/' }, 'http://localhost:5173', '/proj/app/src/components/Counter.tsx'),
    ).toBe('http://localhost:5173/src/components/Counter.tsx')
  })

  test('honors a non-default base', () => {
    expect(
      devModuleUrl(
        { root: '/proj/app', base: '/static/build/' },
        'http://localhost:5173',
        '/proj/app/src/components/Counter.tsx',
      ),
    ).toBe('http://localhost:5173/static/build/src/components/Counter.tsx')
  })

  test('honors base together with an out-of-root /@fs/ path', () => {
    expect(
      devModuleUrl(
        { root: '/proj/app', base: '/static/build/' },
        'http://localhost:5173',
        '/proj/ui/components/Counter.tsx',
      ),
    ).toBe('http://localhost:5173/static/build/@fs/proj/ui/components/Counter.tsx')
  })
})

describe('devScriptAssets', () => {
  test('returns [@vite/client, the component module URL], in that order', () => {
    const config = { root: '/proj/app', base: '/' }
    expect(devScriptAssets(config, 'http://localhost:5173', '/proj/app/src/components/Counter.tsx')).toEqual([
      'http://localhost:5173/@vite/client',
      'http://localhost:5173/src/components/Counter.tsx',
    ])
  })
})

describe('resolveDevOrigin', () => {
  function fakeServer(overrides: {
    origin?: string
    port?: number
    address?: { port: number } | string | null
  }): ViteDevServer {
    return {
      config: {
        server: {
          origin: overrides.origin,
          port: overrides.port,
        },
      },
      httpServer:
        overrides.address === undefined
          ? null
          : ({ address: () => overrides.address } as unknown as ViteDevServer['httpServer']),
      // biome-ignore lint: minimal fake, only the fields resolveDevOrigin reads are real
    } as any
  }

  test('returns the user-configured origin unchanged when set', () => {
    const server = fakeServer({ origin: 'https://example.com' })
    expect(resolveDevOrigin(server)).toBe('https://example.com')
  })

  test('derives from the ACTUAL bound port (httpServer.address()), not the configured port', () => {
    // The case `strictPort: false` (the default) makes this matter: Vite
    // auto-increments past an in-use configured port.
    const server = fakeServer({ port: 5173, address: { port: 5174 } })
    expect(resolveDevOrigin(server)).toBe('http://localhost:5174')
  })

  test('writes the computed default back onto server.config.server.origin', () => {
    const server = fakeServer({ port: 5173, address: { port: 5174 } })
    resolveDevOrigin(server)
    expect(server.config.server.origin).toBe('http://localhost:5174')
  })

  test('falls back to the configured port when there is no httpServer (middleware mode)', () => {
    const server = fakeServer({ port: 5173 })
    expect(resolveDevOrigin(server)).toBe('http://localhost:5173')
  })
})

describe('DEFAULT_DEV_CORS_ORIGIN', () => {
  test('matches localhost and 127.0.0.1 at any port', () => {
    expect(DEFAULT_DEV_CORS_ORIGIN.test('http://localhost:3010')).toBe(true)
    expect(DEFAULT_DEV_CORS_ORIGIN.test('https://127.0.0.1:8080')).toBe(true)
    expect(DEFAULT_DEV_CORS_ORIGIN.test('http://localhost')).toBe(true)
  })

  test('does NOT match an arbitrary remote origin', () => {
    expect(DEFAULT_DEV_CORS_ORIGIN.test('https://evil.example.com')).toBe(false)
  })
})

describe('dev-artifact marker', () => {
  test('filename is a dotfile so it does not read as a template', () => {
    expect(DEV_ARTIFACT_MARKER_FILENAME.startsWith('.')).toBe(true)
  })

  test('content warns against committing/deploying and names the fix', () => {
    expect(DEV_ARTIFACT_MARKER_CONTENT).toContain('DEV BUILD OUTPUT')
    expect(DEV_ARTIFACT_MARKER_CONTENT).toContain('vite build')
  })
})
