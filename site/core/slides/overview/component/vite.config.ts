import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'

// barefoot() names each component's own entry after its path (e.g.
// "components/Arcade.tsx"), which rollup would emit as a components/
// subdirectory — flattened so the build stays one directory deep, the shape
// build-slides.ts copies into the deck's flat assets/.
function flattenName(name: string): string {
  return name.replace(/\.tsx$/, '').replaceAll('/', '-')
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // 日記の tetris/component と同じ理由でオブジェクト形式。
      // mount と各コンポーネントが同じ runtime チャンクを共有する必要がある。
      input: { mount: 'mount.ts', narration: 'narration.ts' },
      output: {
        // mount.js/narration.js are referenced by path, never through a
        // manifest (the layouts hardcode `assets/mount.js`), so an entry
        // must not carry a content hash.
        entryFileNames: (chunk) => `${flattenName(chunk.name)}.js`,
        chunkFileNames: (chunk) => `${flattenName(chunk.name)}-[hash].js`,
      },
    },
  },
  plugins: [
    barefoot({
      adapter: new CSRAdapter(),
      components: [
        './components',
        // The UI kit components Showcase.tsx composes, listed one directory
        // at a time (not the whole `ui/components/ui`) so the heavy chart/
        // xyflow packages under sibling dirs never enter this deck's
        // discovery/compile pass. slot and icon are here for the same reason
        // even though Showcase.tsx never names them: Button/Badge import Slot
        // for `asChild` and Checkbox imports CheckIcon, and each still needs
        // its own compiled entry.
        '../../../../../ui/components/ui/card',
        '../../../../../ui/components/ui/button',
        '../../../../../ui/components/ui/input',
        '../../../../../ui/components/ui/label',
        '../../../../../ui/components/ui/checkbox',
        '../../../../../ui/components/ui/switch',
        '../../../../../ui/components/ui/avatar',
        '../../../../../ui/components/ui/badge',
        '../../../../../ui/components/ui/separator',
        '../../../../../ui/components/ui/slot',
        '../../../../../ui/components/ui/icon',
      ],
      // CSRAdapter's own `generate()` output is always empty, but a
      // multi-export file (card/avatar/icon/etc. each export several named
      // components from one module) still produces a non-empty
      // `markedTemplate` independent of the adapter — `generateModuleExports`
      // synthesizes the file's `export { A, B, ... }` statement into the
      // template regardless of which adapter is active, so the plugin's
      // `assertNoRealTemplateOutput` refuses to compile without `templates`
      // set. Point it at a throwaway dir under the already-gitignored
      // `dist/` — nothing in the deck build reads it; only the resulting
      // client JS files (build-slides.ts copies dist/ as-is) matter.
      templates: 'dist/templates',
    }),
  ],
})
