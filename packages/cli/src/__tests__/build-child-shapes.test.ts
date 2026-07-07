/**
 * Cross-file child-shape pre-pass (#2131).
 *
 * `bf build` compiles each source independently, but the Go template
 * adapter's call-site codegen needs the CHILD component's shape (declared
 * params + rest-bag field) registered before the PARENT's `generateTypes`
 * runs — otherwise an HTML attribute passed to a rest-spread child
 * (`<Input placeholder="..." />` where Input is
 * `({ className, type, ...props }: InputHTMLAttributes)`) is emitted as a
 * named Go struct field (`Placeholder:`) that the generated `InputInput`
 * struct never declares, and the project's `go build` fails with
 * `unknown field Placeholder in struct literal`.
 *
 * The adapter-tests harness always registered shapes (`registerChildShape`
 * in test-render.ts); this pins that the CLI build pipeline does too
 * (`registerAdapterChildShapes` in lib/build.ts).
 */

import { describe, test, expect } from 'bun:test'
import { build } from '../lib/build'
import { GoTemplateAdapter } from '../../../adapter-go-template/src/adapter/go-template-adapter'
import { mkdirSync, writeFileSync, rmSync, realpathSync } from 'fs'
import { resolve } from 'path'
import { tmpdir } from 'os'

function makeTmpDir(label: string) {
  const dir = resolve(tmpdir(), `bf-test-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  mkdirSync(dir, { recursive: true })
  return realpathSync(dir)
}

// A rest-spread child in the shape of the `bf add input` registry component:
// `placeholder` / `value` are NOT declared params, so they belong in the
// open-ended `Props map[string]any` rest bag.
const INPUT_SOURCE = `'use client'
interface InputHTMLAttributes {
  className?: string
  type?: string
  [key: string]: unknown
}

export function Input({ className = '', type, ...props }: InputHTMLAttributes) {
  return <input type={type} className={className} {...props} />
}
`

const PROBE_SOURCE = `'use client'
import { Input } from './input'

export function InputAttrProbe() {
  return (
    <div>
      <Input placeholder="type here" value="seed" />
    </div>
  )
}
`

describe('build() registers child component shapes before compiling (#2131)', () => {
  test('rest-spread child attrs land in the Props rest bag, not named struct fields', async () => {
    const projectDir = makeTmpDir('child-shapes-src')
    const outDir = makeTmpDir('child-shapes-out')
    try {
      const componentsDir = resolve(projectDir, 'components')
      mkdirSync(componentsDir, { recursive: true })
      writeFileSync(resolve(componentsDir, 'input.tsx'), INPUT_SOURCE)
      writeFileSync(resolve(componentsDir, 'probe.tsx'), PROBE_SOURCE)

      const collectedTypes = new Map<string, string>()
      const result = await build({
        projectDir,
        adapter: new GoTemplateAdapter(),
        componentDirs: [componentsDir],
        outDir,
        minify: false,
        contentHash: false,
        clientOnly: false,
        postBuild: (ctx) => {
          for (const [k, v] of ctx.types) collectedTypes.set(k, v)
        },
      })

      expect(result.errorCount).toBe(0)
      const probeTypes = collectedTypes.get('probe')
      expect(probeTypes).toBeDefined()

      // The call site routes the non-param attrs into the child's rest bag…
      expect(probeTypes!).toContain('Props: map[string]any{"placeholder": "type here", "value": "seed"}')
      // …and emits no named struct fields the generated InputInput never declares.
      expect(probeTypes!).not.toContain('Placeholder:')
      expect(probeTypes!).not.toContain('Value:')
    } finally {
      rmSync(projectDir, { recursive: true, force: true })
      rmSync(outDir, { recursive: true, force: true })
    }
  })
})
