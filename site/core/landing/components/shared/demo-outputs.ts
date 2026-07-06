/**
 * Landing-page demo panel contents.
 *
 * PLACEHOLDER — these panels currently mirror the design mock
 * (design/lp-mock/barefootjs-lp-v3.html) and are replaced with real
 * `compileJSX` output by landing/generate-demo-outputs.ts in the
 * demo-realization step (see design/LP-RENEWAL.md, Phase 3).
 */

/** The exact Counter.tsx source shown in the left panel. */
export const DEMO_SOURCE = `"use client"

import { createSignal } from '@barefootjs/client'

export function Counter() {
  const [count, setCount] = createSignal(0)
  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count()}
    </button>
  )
}`

export interface DemoOutput {
  id: string
  label: string
  file: string
  lang: string
  code: string
}

export const DEMO_OUTPUTS: DemoOutput[] = [
  {
    id: 'go',
    label: 'go',
    file: 'counter.tmpl',
    lang: 'go-html-template',
    code: '<button data-bf="counter">\n  Count: {{ .Count }}\n</button>',
  },
  {
    id: 'erb',
    label: 'rails',
    file: 'counter.html.erb',
    lang: 'erb',
    code: '<button data-bf="counter">\n  Count: <%= count %>\n</button>',
  },
  {
    id: 'jinja',
    label: 'django',
    file: 'counter.html.j2',
    lang: 'jinja',
    code: '<button data-bf="counter">\n  Count: {{ count }}\n</button>',
  },
  {
    id: 'ep',
    label: 'perl',
    file: 'counter.html.ep',
    lang: 'perl',
    code: '<button data-bf="counter">\n  Count: <%= $count %>\n</button>',
  },
]

/** The client JS the compiler emits alongside the templates. */
export const DEMO_CLIENT_JS = ''
