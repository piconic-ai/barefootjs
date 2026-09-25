---
"@barefootjs/pebble": patch
---

`@barefootjs/pebble/test-render` starts its render JVMs with `-XX:-UsePerfData -Xlog:disable -Xlog:all=warning:stderr`. The rendered HTML is read from stdout, where the JVM prints warnings by default, so a warning such as an `hsperfdata` file-lock notice could be prepended to the HTML.
