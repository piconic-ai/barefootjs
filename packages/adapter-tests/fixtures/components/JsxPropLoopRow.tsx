'use client'

import { SlotLoopList } from './SlotLoopList'
import { SlotLoopListDestructured } from './SlotLoopListDestructured'
import { SlotLoopNested } from './SlotLoopNested'

export function JsxPropLoopRow() {
  return (
    <div>
      <SlotLoopList footer={<b className="f">foot</b>} label="x < y" flag={true} />
      <SlotLoopListDestructured footer={<b className="f">foot</b>} label="x < y" />
      <SlotLoopNested footer={<b className="f">foot</b>} />
    </div>
  )
}
