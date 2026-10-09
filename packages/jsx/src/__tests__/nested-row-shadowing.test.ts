import { describe, expect, test } from 'bun:test'
import { compileJSX } from '../compiler'
import { TestAdapter } from '../adapters/test-adapter'

// #3394: inside a nested `.map()` row, an enclosing loop's accessor rewrite
// skips the names that row rebinds, and keeps every other ancestor's rewrite.
describe('enclosing loop rewrites inside a nested row (#3394)', () => {
  const clientJs = (source: string): string => {
    const result = compileJSX(source, 'C.tsx', { adapter: new TestAdapter() })
    expect(result.errors.filter(e => e.severity === 'error')).toEqual([])
    return result.files.find(f => f.type === 'clientJs')!.content
  }

  test('an inner preamble local named like an outer destructure binding keeps its name', () => {
    const js = clientJs(`
'use client'
export function N(props: { groups: { name: string; tags: string[] }[] }) {
  return (
    <ul>{props.groups.map(({ name, tags }) => (
      <li key={name}>
        <em>{tags.map(t => {
          const name = t + '!'
          return <i key={t}>{name}</i>
        })}</em>{name}
      </li>
    ))}</ul>
  )
}
`)
    expect(js).not.toContain('const __bfItem().name')
    expect(js).toContain("const name = t() + '!'")
    expect(js).toContain('String(name)')
    expect(js).toContain('String(__bfItem().name)')
  })

  test('a row two loops deep still reads the outermost item through its accessor', () => {
    const js = clientJs(`
'use client'
import { createSignal } from '@barefootjs/client'
type Reply = { id: string; text: string }
type Comment = { id: string; show: boolean; replies: Reply[] }
type Post = { id: string; text: string; show: boolean; comments: Comment[] }
export function Feed() {
  const [posts] = createSignal<Post[]>([])
  return <main>{posts().map(post => <article key={post.id}>
    {post.show ? <section>{post.comments.map(comment => <div key={comment.id}>
      {comment.show ? <ul>{comment.replies.map(reply =>
        <li key={reply.id}>{post.text + reply.text}</li>
      )}</ul> : null}
    </div>)}</section> : null}
  </article>)}</main>
}
`)
    expect(js).toContain('String(post().text + reply().text)')
    expect(js).not.toContain('String(post.text + reply().text)')
  })
})
