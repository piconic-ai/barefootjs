'use client'

// Test fixture: a signal-driven <textarea> whose text starts with a line
// feed. The HTML parser drops ONE leading line feed of a textarea's content,
// so the server-rendered value is 'hello'; hydration and later updates must
// not add the blank line back.

import { createSignal } from '@barefootjs/client'

export function RawTextHostTextareaLeadingNewline() {
  const [text, setText] = createSignal('\nhello')
  return (
    <div>
      <textarea className="area">{text()}</textarea>
      <button className="go" onClick={() => setText('\nworld')}>go</button>
    </div>
  )
}
