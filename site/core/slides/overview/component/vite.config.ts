import { defineConfig } from 'vite'
import { barefoot } from '@barefootjs/vite'
import { CSRAdapter } from '@barefootjs/client/csr-adapter'

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // 日記の tetris/component と同じ理由でオブジェクト形式。
      // mount と各コンポーネントが同じ runtime チャンクを共有する必要がある。
      input: { mount: 'mount.ts', narration: 'narration.ts' },
    },
  },
  plugins: [
    barefoot({
      adapter: new CSRAdapter(),
      components: ['./components'],
    }),
  ],
})
