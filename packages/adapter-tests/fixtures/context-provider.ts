import { createFixture } from '../src/types'

export const fixture = createFixture({
  id: 'context-provider',
  description: 'Context.Provider passes value to descendant via useContext',
  source: `
'use client'
import { createContext, useContext } from '@barefootjs/client'

const ThemeContext = createContext('light')

function ThemeLabel() {
  const theme = useContext(ThemeContext)
  return <span class="theme">{theme}</span>
}

export function ThemeRoot() {
  return (
    <div class="root">
      <ThemeContext.Provider value="dark">
        <ThemeLabel />
      </ThemeContext.Provider>
    </div>
  )
}
`,
  expectedHtml: `
    <div bf-s="test" class="root"><span bf-s="test_s0" class="theme">dark</span></div>
  `,
})
