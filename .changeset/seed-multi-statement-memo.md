---
"@barefootjs/jsx": patch
---

A memo whose body is more than one statement (`() => { const k = count(); return k * 3 }`) is now seeded by the template adapters that seed memos in-template (Jinja, ERB, Mojolicious, Pebble, MiniJinja, Xslate). It seeds from the analyzer's fold of its statements into one expression instead of rendering empty. Without a type argument, such a memo is also typed from that fold rather than from the block's text, where `{` read as an object, so Go Template no longer declares it `map[string]interface{}` and renders `map[]`.
