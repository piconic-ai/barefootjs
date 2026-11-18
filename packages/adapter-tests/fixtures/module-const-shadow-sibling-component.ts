import { createFixture } from '../src/types'

/**
 * Two components of one file read the same module consts, and only one of
 * them declares a const named like one (#3739). `Parent` hides `label`, so
 * its own read is `local`; `greeting` (a module const reading `label`) keeps
 * the module value in both, read directly and forwarded as a prop. The
 * sibling, which hides nothing, reads the module `label`.
 */
export const fixture = createFixture({
  id: 'module-const-shadow-sibling-component',
  description: 'A component const hides a module const in its own component, not in a sibling of the same file',
  source: `
'use client'
const label = 'module'
const greeting = label + '!'

function ModuleConstShadowSiblingChild({ text }: { text: string }) {
  return <span>{label}/{greeting}/{text}</span>
}

export function ModuleConstShadowSiblingComponent() {
  const label = 'local'
  return <div>{label}/{greeting}<ModuleConstShadowSiblingChild text={greeting} /></div>
}
`,
  componentName: 'ModuleConstShadowSiblingComponent',
  expectedHtml: `
    <div bf-s="test">local/module!<span bf-s="test_s0" bf="s1">module/module!/<!--bf:s0-->module!<!--/--></span></div>
  `,
})
