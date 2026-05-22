import { describe, test, expect } from 'bun:test'
import { parseMdx, projectMdxToMarkdown, defaultMdxProjectors } from '../lib/mdx'

describe('parseMdx', () => {
  test('parses frontmatter and a plain markdown body', () => {
    const source = `---
title: Hello
description: a test
---

Just markdown, no JSX.
`
    const result = parseMdx(source)
    expect(result.frontmatter).toEqual({ title: 'Hello', description: 'a test' })
    expect(result.nodes).toEqual([{ type: 'md', text: 'Just markdown, no JSX.' }])
  })

  test('splits markdown around a self-closing JSX tag', () => {
    const source = `## Step 1

<PackageManagerTabs command="barefootjs@latest" mode="create" />

Press Enter.`
    const result = parseMdx(source)
    expect(result.nodes).toEqual([
      { type: 'md', text: '## Step 1' },
      { type: 'jsx', name: 'PackageManagerTabs', props: { command: 'barefootjs@latest', mode: 'create' } },
      { type: 'md', text: 'Press Enter.' },
    ])
  })

  test('extracts multiple props from a JSX tag', () => {
    const source = `<Tabs a="one" b="two" data-foo="bar" />`
    const result = parseMdx(source)
    expect(result.nodes).toEqual([
      { type: 'jsx', name: 'Tabs', props: { a: 'one', b: 'two', 'data-foo': 'bar' } },
    ])
  })

  test('leaves JSX-like tags inside fenced code blocks as markdown', () => {
    const source = '```tsx\n<Foo bar="baz" />\n```\n'
    const result = parseMdx(source)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0]).toEqual({
      type: 'md',
      text: '```tsx\n<Foo bar="baz" />\n```',
    })
  })

  test('handles a JSX tag with no props', () => {
    const source = `Before

<Marker />

After`
    const result = parseMdx(source)
    expect(result.nodes).toEqual([
      { type: 'md', text: 'Before' },
      { type: 'jsx', name: 'Marker', props: {} },
      { type: 'md', text: 'After' },
    ])
  })

  test('returns empty nodes for body containing only a JSX tag', () => {
    const result = parseMdx('<Marker />')
    expect(result.nodes).toEqual([{ type: 'jsx', name: 'Marker', props: {} }])
  })
})

describe('projectMdxToMarkdown', () => {
  test('replaces JSX tags with projector output and re-emits frontmatter', () => {
    const source = `---
title: Quick Start
---

## 1. Scaffold

<PackageManagerTabs command="barefootjs@latest" mode="create" />

Press Enter.
`
    const projected = projectMdxToMarkdown(source, defaultMdxProjectors)
    expect(projected).toBe(
      [
        '---',
        'title: Quick Start',
        '---',
        '',
        '## 1. Scaffold',
        '',
        '```bash',
        'npm create barefootjs@latest',
        '```',
        '',
        'Press Enter.',
        '',
      ].join('\n'),
    )
  })

  test('drops unknown components rather than leaking JSX', () => {
    const source = `Before

<UnknownThing foo="bar" />

After`
    const projected = projectMdxToMarkdown(source, {})
    expect(projected).toBe('Before\n\nAfter\n')
  })

  test('projects PackageManagerTabs in dlx mode with default npm', () => {
    const source = '<PackageManagerTabs command="my-pkg" />'
    expect(projectMdxToMarkdown(source, defaultMdxProjectors)).toBe(
      ['```bash', 'npx my-pkg', '```', ''].join('\n'),
    )
  })

  test('projects PackageManagerTabs in create mode honouring defaultPm', () => {
    const source = '<PackageManagerTabs command="my-pkg@latest" mode="create" defaultPm="bun" />'
    expect(projectMdxToMarkdown(source, defaultMdxProjectors)).toBe(
      ['```bash', 'bun create my-pkg', '```', ''].join('\n'),
    )
  })
})
