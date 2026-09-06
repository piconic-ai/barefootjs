---
"@barefootjs/hono": patch
"@barefootjs/go-template": patch
"@barefootjs/erb": patch
"@barefootjs/jinja": patch
"@barefootjs/php": patch
"@barefootjs/blade": patch
"@barefootjs/twig": patch
"@barefootjs/perl": patch
"@barefootjs/mojolicious": patch
"@barefootjs/xslate": patch
"@barefootjs/rust": patch
---

Fix the SSR-side twin of #2795's client-JS anchor-comment escape gap: the whole-item-conditional loop's `<!--bf-loop-i:KEY-->` anchor (#1665) spliced its user-controlled key raw into every adapter's own `comment(text)`/`bfComment` runtime primitive (`<!--bf-${text}-->`, no escaping of its own), so a key containing `-->` could close the comment early on initial server render, not just in the hydration template. The identical gap existed independently in all 7 distinct runtimes behind these 11 packages (PHP is shared by Blade + Twig; Perl is shared by Mojolicious + Xslate). Each gets a new `escape_comment_key` helper (Hono: `escapeCommentKey`) that stringifies the key with the runtime's existing JS-`String()`-equivalent and replaces every `-` with the visually-similar U+2010, the same reasoning and the same lossy, no-decode-needed substitution as the client-side `escapeCommentText` this PR's earlier commit added — nothing reads the key back out of the DOM on the SSR side either. Proven end-to-end: `loop-item-conditional`'s conformance fixture now uses a hyphenated key, with `expectedHtml` verified against the Hono reference adapter's actual (now-escaped) output.
