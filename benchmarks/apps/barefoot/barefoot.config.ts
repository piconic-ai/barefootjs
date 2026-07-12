import { createConfig } from '@barefootjs/client/build'

export default createConfig({
  components: ['components'],
  outDir: 'dist',
  minify: true,
  // Perf (#2143 gap 4): drop the always-kept public mount API — this app
  // has no hand-written page script beyond `build.ts`'s inline
  // `<script type="module">` bootstrap (see its `import { render } from
  // '@barefootjs/client/runtime'`), which the collector can't see since
  // it lives inside an HTML template literal rather than a compiled or
  // bundled source file. `render` is the only name that script calls.
  runtimeBundle: 'treeshake-exact',
  runtimeKeep: ['render'],
})
