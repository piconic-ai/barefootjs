---
"@barefootjs/jsx": patch
---

Fix JSX text on its own line keeping its surrounding whitespace. A text child split across lines — the shape Biome/Prettier produce for a long line — now follows the same whitespace rule TypeScript, Babel and React use: whitespace touching a line break is trimmed from each line, empty lines are dropped, and what's left is joined with a single space.

This also fixes a second, related bug: whitespace between inline siblings on one line (`{a} {b}`, `<b>a</b> <i>b</i>`) was previously dropped entirely instead of being preserved as JSX requires — a duplicate, looser "does this render nothing?" check in `transformChildren` discarded it even though it didn't touch a line break. That duplicate check is removed; the space is now correctly kept (`{first} {last}` renders `Ada Lovelace`, not `AdaLovelace`). This is a visible output change for any existing app that relied on the old (incorrect) dropped-space behavior.

Applies to every adapter, since this is Phase 1 of the shared compiler pipeline.
