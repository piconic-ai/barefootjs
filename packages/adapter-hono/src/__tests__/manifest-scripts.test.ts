import { describe, test, expect } from 'bun:test'
import { manifestToScriptUrls } from '../app'

describe('manifestToScriptUrls', () => {
  test('empty manifest returns empty array', () => {
    expect(manifestToScriptUrls({}, '/static/components')).toEqual([])
  })

  test('runtime entry is emitted first', () => {
    const out = manifestToScriptUrls(
      {
        Counter: { clientJs: 'components/Counter.client.js' },
        __barefoot__: { clientJs: 'components/barefoot.js' },
      },
      '/static/components',
    )
    expect(out[0]).toBe('/static/components/barefoot.js')
    expect(out).toContain('/static/components/Counter.client.js')
  })

  test('drops "components/" prefix from manifest paths', () => {
    expect(
      manifestToScriptUrls(
        { Counter: { clientJs: 'components/Counter.client.js' } },
        '/static/components',
      ),
    ).toEqual(['/static/components/Counter.client.js'])
  })

  test('preserves nested subdirs from manifest', () => {
    expect(
      manifestToScriptUrls(
        { 'ui/button/index': { clientJs: 'components/ui/button/index.client.js' } },
        '/static/components',
      ),
    ).toEqual(['/static/components/ui/button/index.client.js'])
  })

  test('honors custom base URL', () => {
    expect(
      manifestToScriptUrls(
        {
          __barefoot__: { clientJs: 'components/barefoot.js' },
          Counter: { clientJs: 'components/Counter.client.js' },
        },
        '/assets/bf',
      ),
    ).toEqual([
      '/assets/bf/barefoot.js',
      '/assets/bf/Counter.client.js',
    ])
  })

  test('strips trailing slash from base URL', () => {
    expect(
      manifestToScriptUrls(
        { Counter: { clientJs: 'components/Counter.client.js' } },
        '/static/components/',
      ),
    ).toEqual(['/static/components/Counter.client.js'])
  })

  test('skips entries without clientJs', () => {
    expect(
      manifestToScriptUrls(
        {
          __barefoot__: { clientJs: 'components/barefoot.js' },
          ServerOnly: {},
          Counter: { clientJs: 'components/Counter.client.js' },
        },
        '/static/components',
      ),
    ).toEqual([
      '/static/components/barefoot.js',
      '/static/components/Counter.client.js',
    ])
  })

  test('passthrough for clientJs paths not under "components/"', () => {
    expect(
      manifestToScriptUrls(
        { Counter: { clientJs: 'Counter.client.js' } },
        '/static/components',
      ),
    ).toEqual(['/static/components/Counter.client.js'])
  })
})
