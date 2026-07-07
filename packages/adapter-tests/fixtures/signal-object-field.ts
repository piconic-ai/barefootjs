import { createFixture } from '../src/types'

/**
 * A signal holding an OBJECT, with member reads (`user().name`) in
 * text and attribute positions. Scalar signals dominate the corpus;
 * this pins the object-valued signal's SSR baking (Go needs a struct
 * or map for the field, dynamic languages a hash) and the member
 * access lowering off a getter call.
 */
export const fixture = createFixture({
  id: 'signal-object-field',
  description: 'Object-valued signal with member reads in text and attributes',
  source: `
'use client'
import { createSignal } from '@barefootjs/client'
type User = { name: string; role: string }
export function SignalObjectField() {
  const [user, setUser] = createSignal<User>({ name: 'Ada', role: 'admin' })
  return (
    <div data-role={user().role}>
      <span>{user().name}</span>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" bf="s2" data-role="admin"><span bf="s1"><!--bf:s0-->Ada<!--/--></span></div>
  `,
})
