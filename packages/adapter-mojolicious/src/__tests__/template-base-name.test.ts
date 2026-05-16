import { describe, test, expect } from 'bun:test'
import { templateBaseName } from '../test-render'

describe('templateBaseName (#1297)', () => {
  test('strips Mojo adapter `.html.ep` extension, not just the last dot segment', () => {
    // The crux of the #1297 follow-up: a naive `/\.[^.]+$/` would leave
    // `Counter.html` here, which would miss the `irsByName` lookup
    // (componentName is `Counter`) and pair every sibling template to
    // the entry-point IR.
    expect(templateBaseName('component/Counter.html.ep', '.html.ep')).toBe('Counter')
    expect(templateBaseName('theme/ThemeLabel.html.ep', '.html.ep')).toBe('ThemeLabel')
    expect(templateBaseName('src/very/nested/path/Outer.html.ep', '.html.ep')).toBe('Outer')
  })

  test('works for single-segment extensions too', () => {
    expect(templateBaseName('dir/Counter.tmpl', '.tmpl')).toBe('Counter')
  })

  test('returns the bare filename when the extension does not match', () => {
    expect(templateBaseName('dir/Counter.txt', '.html.ep')).toBe('Counter.txt')
  })

  test('handles paths with no directory component', () => {
    expect(templateBaseName('Counter.html.ep', '.html.ep')).toBe('Counter')
  })
})
