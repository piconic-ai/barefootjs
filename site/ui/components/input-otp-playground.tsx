"use client"
/**
 * InputOTP Props Playground
 *
 * Interactive playground for the InputOTP component.
 * Allows tweaking maxLength and disabled props with live preview.
 */

import { createSignal, createMemo, createEffect } from '@barefootjs/client'
import { CopyButton } from './copy-button'
import { highlightJsxTree, plainJsxTree, type JsxTreeNode } from './shared/playground-highlight'
import { PlaygroundLayout, PlaygroundControl } from './shared/PlaygroundLayout'
import { Checkbox } from '@ui/components/ui/checkbox'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/ui/select'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@ui/components/ui/input-otp'

function InputOTPPlayground(_props: {}) {
  const [maxLength, setMaxLength] = createSignal('6')
  const [disabled, setDisabled] = createSignal(false)

  const maxLengthNum = createMemo(() => parseInt(maxLength(), 10))

  const tree = (): JsxTreeNode => ({
    tag: 'InputOTP',
    props: [
      { name: 'maxLength', value: String(maxLengthNum()), defaultValue: '', kind: 'expression' as const },
      { name: 'disabled', value: String(disabled()), defaultValue: 'false', kind: 'boolean' as const },
    ],
    children: [{
      tag: 'InputOTPGroup',
      children: Array.from({ length: maxLengthNum() }, (_, i) => ({
        tag: 'InputOTPSlot',
        props: [{ name: 'index', value: String(i), defaultValue: '', kind: 'expression' as const }],
      })),
    }],
  })

  const codeText = createMemo(() => plainJsxTree(tree()))

  createEffect(() => {
    const codeEl = document.querySelector('[data-playground-code]') as HTMLElement
    if (codeEl) codeEl.innerHTML = highlightJsxTree(tree())
  })

  // Toggle visibility of pre-rendered variants based on maxLength
  const show4 = (el: HTMLElement) => {
    createEffect(() => {
      el.style.display = maxLengthNum() === 4 ? '' : 'none'
    })
  }
  const show6 = (el: HTMLElement) => {
    createEffect(() => {
      el.style.display = maxLengthNum() === 6 ? '' : 'none'
    })
  }

  return (
    <PlaygroundLayout
      previewDataAttr="data-input-otp-preview"
      previewContent={<>
        <div ref={show4}>
          <InputOTP maxLength={4} disabled={disabled()}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
            </InputOTPGroup>
          </InputOTP>
        </div>
        <div ref={show6}>
          <InputOTP maxLength={6} disabled={disabled()}>
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>
      </>}
      controls={<>
        <PlaygroundControl label="maxLength">
          <Select value={maxLength()} onValueChange={(v: string) => setMaxLength(v)}>
            <SelectTrigger>
              <SelectValue placeholder="Select length..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4</SelectItem>
              <SelectItem value="6">6</SelectItem>
            </SelectContent>
          </Select>
        </PlaygroundControl>
        <PlaygroundControl label="disabled">
          <Checkbox
            checked={disabled()}
            onCheckedChange={setDisabled}
          />
        </PlaygroundControl>
      </>}
      copyButton={<CopyButton code={codeText()} />}
    />
  )
}

export { InputOTPPlayground }
