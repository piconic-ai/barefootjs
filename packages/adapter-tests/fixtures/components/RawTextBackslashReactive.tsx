'use client'

// Test fixture: a CSS string in a `<style>` whose backslash-escaped `<` / `&`
// is spelled across children (a static backslash, then a signal value). The
// selector matches only if `\<b` still reads as `<b` after the raw-text
// encoding: written as `\\3c b` it would be a backslash and `3c b`.

import { createSignal } from '@barefootjs/client'

export function RawTextBackslashReactive() {
  const [k, setK] = createSignal('<b')
  return (
    <div>
      <style className="rule">{'[data-k="'}{'\\'}{k()}{'"]{color:red}'}</style>
      <i className="lt" data-k={'<b'}>lt</i>
      <i className="amp" data-k={'&amp'}>amp</i>
      <button className="go" onClick={() => setK('&amp')}>go</button>
    </div>
  )
}
