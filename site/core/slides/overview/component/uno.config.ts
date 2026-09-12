// Regenerates css/1-ui-kit.css — see the deck's README ("Regenerating
// css/1-ui-kit.css") for the exact command. Not used at deck-build or
// deck-runtime; only by that one-off generation step, run manually from
// site/ui (which has @unocss/cli installed).
//
// Reuses site/ui/uno.config.ts's own theme (colors/radius/shadow/font/
// tracking/duration all reference CSS custom properties, e.g.
// `primary: 'var(--primary)'` — the generated rule is just
// `background-color: var(--primary)`, so the SAME theme object produces
// correct output regardless of what those variables resolve to here vs.
// in the real site/ui build) but disables preset-wind4's own preflight
// (browser reset) — this deck's showcase gets its own hand-written,
// `.showcase`-scoped reset in css/1-ui-kit.css instead, so the kit's
// global `*` reset never leaks onto the rest of the slide deck.
import { defineConfig, presetWind4 } from 'unocss'
import baseConfig from '../../../../ui/uno.config'

// Split a selector list on commas that are not inside `()` or `[]`.
function splitTopLevel(selector: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    else if (c === ',' && depth === 0) { out.push(selector.slice(start, i).trim()); start = i + 1 }
  }
  out.push(selector.slice(start).trim())
  return out.filter(Boolean)
}

export default defineConfig({
  ...baseConfig,
  presets: [presetWind4({ preflights: { reset: false, property: false } })],
  preflights: [],
  outputToCssLayers: false,
  safelist: [],
  // Every generated utility is nested under `.showcase` (Showcase.tsx's root)
  // so the bare class names UnoCSS emits (`.flex`, `.grid`, `.border`, ...)
  // can never style sibling slides or peitho's own viewer markup — those
  // names are too generic to leave global. Selector lists are prefixed
  // per member so `.a,.b` becomes `.showcase .a,.showcase .b`.
  postprocess: (util) => {
    // `@property --un-*` registrations ride through here as utilities too;
    // they are global by nature and must stay unprefixed.
    if (util.selector.startsWith('@')) return
    util.selector = splitTopLevel(util.selector).map(s => `.showcase ${s}`).join(',')
  },
  content: {
    filesystem: [
      '../../../../ui/components/ui/{card,button,input,label,checkbox,switch,avatar,badge,separator,slot,icon}/index.tsx',
      './components/Showcase.tsx',
    ],
  },
})
