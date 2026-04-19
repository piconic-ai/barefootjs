'use client'

/**
 * Form Component (Shared)
 *
 * A practical form demonstrating checkbox + button interaction.
 * When the checkbox is checked, the submit button becomes enabled.
 * This component tests:
 * - Checkbox state toggle
 * - Conditional button disabled attribute
 * - Null branch rendering (SVG checkmark appears/disappears)
 */

import { createSignal } from '@barefootjs/client'

export function Form() {
  const [accepted, setAccepted] = createSignal(false)

  return (
    <div className="form-container" style="padding: 24px; max-width: 400px; margin: 0 auto;">
      <h2 style="margin-top: 0;">Terms and Conditions</h2>
      <p style="color: #666; font-size: 14px;">
        Please read and accept the terms before continuing.
      </p>

      <div className="checkbox-row" style="display: flex; align-items: center; gap: 12px; margin: 20px 0;">
        <button
          className="checkbox"
          data-state={accepted() ? 'checked' : 'unchecked'}
          onClick={() => setAccepted(!accepted())}
          style={`width: 24px; height: 24px; border: 2px solid ${accepted() ? '#4caf50' : '#ccc'}; border-radius: 4px; background: ${accepted() ? '#4caf50' : 'white'}; cursor: pointer; display: flex; align-items: center; justify-content: center; padding: 0;`}
          aria-checked={accepted()}
          role="checkbox"
        >
          {accepted() && (
            <svg
              className="checkmark"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              style="display: block;"
            >
              <path
                d="M3 8L6.5 11.5L13 5"
                stroke="white"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          )}
        </button>
        <label className="checkbox-label" style="cursor: pointer; user-select: none;">
          I agree to the terms and conditions
        </label>
      </div>

      <button
        className="submit-btn"
        disabled={!accepted()}
        style={`width: 100%; padding: 12px 24px; font-size: 16px; border: none; border-radius: 6px; cursor: ${accepted() ? 'pointer' : 'not-allowed'}; background: ${accepted() ? '#4caf50' : '#e0e0e0'}; color: ${accepted() ? 'white' : '#999'};`}
      >
        Continue
      </button>
    </div>
  )
}

export default Form
