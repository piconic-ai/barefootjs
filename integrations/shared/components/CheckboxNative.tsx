'use client'

// DOM-state carrier fixture (#2481): native <input type="checkbox"
// checked={...}> — as opposed to the ARIA `role="checkbox"` button the
// `checkbox` (site/ui) fixture already covers. Exercises the `checked`
// IDL property the oracle harness's dom-state.ts vocabulary tracks: a
// runtime that patches only the `checked` ATTRIBUTE after the user has
// already interacted with the control would leave the live `.checked`
// property stale without this ever failing an attribute-based assertion.

import { createSignal } from '@barefootjs/client'

export function CheckboxNative() {
  const [subscribed, setSubscribed] = createSignal(false)

  return (
    <label className="subscribe-row">
      <input
        type="checkbox"
        className="subscribe-checkbox"
        checked={subscribed()}
        onChange={(e) => setSubscribed(e.target.checked)}
      />
      <span className="subscribe-label">{subscribed() ? 'Subscribed' : 'Not subscribed'}</span>
    </label>
  )
}
