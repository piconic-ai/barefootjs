"use client"

import { createSignal } from '@barefootjs/client'

type ToggleItemProps = {
  label: string
  defaultOn?: boolean
}

// Reusable toggle component with label
function ToggleItem(props: ToggleItemProps) {
  const [on, setOn] = createSignal(props.defaultOn ?? false)
  return (
    <div className="toggle-item" style="display: flex; align-items: center; gap: 12px; padding: 8px 0;">
      <span style="min-width: 120px;">{props.label}</span>
      <button
        onClick={() => setOn(!on())}
        style={`padding: 4px 12px; min-width: 60px; background: ${on() ? '#4caf50' : '#ccc'}; color: ${on() ? 'white' : 'black'}; border: none; border-radius: 4px; cursor: pointer;`}
      >
        {on() ? 'ON' : 'OFF'}
      </button>
    </div>
  )
}

type ToggleProps = {
  toggleItems: ToggleItemProps[]
}

// Settings panel with multiple toggles
function Toggle({ toggleItems }: ToggleProps) {
  return (
    <div className="settings-panel" style="padding: 16px; border: 1px solid #ddd; border-radius: 8px;">
      <h3 style="margin-top: 0;">Settings</h3>
      {toggleItems.map((item) => (
        <ToggleItem key={item.label} label={item.label} defaultOn={item.defaultOn} />
      ))}
    </div>
  )
}

export default Toggle
