---
"@barefootjs/jsx": patch
---

Fix JSX text on its own line keeping its surrounding whitespace. A text child split across lines — the shape Biome/Prettier produce for a long line — now follows the same whitespace rule TypeScript, Babel and React use: whitespace touching a line break is trimmed from each line, empty lines are dropped, and what's left is joined with a single space. Whitespace on a single line (no line break) is unaffected. Applies to every adapter, since this is Phase 1 of the shared compiler pipeline.
