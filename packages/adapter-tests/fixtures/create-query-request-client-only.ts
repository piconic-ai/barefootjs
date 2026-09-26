import { createFixture } from '../src/types'

/**
 * `createQuery`'s request function (#3165) reads a local signal and a prop.
 * It is emitted into the client JS like an effect body, with the prop read
 * live (`_p.userId`), and it is never evaluated on the server: it builds its
 * URL from `window.location`, which does not exist during SSR, so any
 * backend that evaluated it would fail to render. The value comes from
 * `initial` alone.
 *
 * `userId` is read only by the request function, so the hydration props must
 * still carry it for the client to build the request.
 */
export const fixture = createFixture({
  id: 'create-query-request-client-only',
  description: 'A createQuery request function that reads a signal and a prop is emitted client-side only and never evaluated at SSR',
  source: `
'use client'
import { createQuery, createSignal, http } from '@barefootjs/client'

export function Feed(props: { userId: number; label: string }) {
  const [page, setPage] = createSignal(1)
  const [items] = createQuery(
    () => http.get<string[]>(window.location.origin + '/api/feed', { user: props.userId, page: page() }),
    { initial: ['first', 'second'] },
  )
  return (
    <section>
      <h2>{props.label}</h2>
      <ul>{items().map((item) => <li key={item}>{item}</li>)}</ul>
      <button onClick={() => setPage(page() + 1)}>next</button>
    </section>
  )
}
`,
  props: { userId: 7, label: 'Feed' },
  expectedHtml: `
    <section bf-s="test">
      <h2 bf="s1"><!--bf:s0-->Feed<!--/--></h2>
      <ul bf="s3">
        <li data-key="first"><!--bf:s2-->first<!--/--></li>
        <li data-key="second"><!--bf:s2-->second<!--/--></li>
      </ul>
      <button bf="s4">next</button>
    </section>
  `,
})
