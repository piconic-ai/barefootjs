# tagged-todo — SSR ↔ hydration audit

タグつき TODO テーブル(keyed loop + filter/sort チェーン + `.map()` ブロック体 + flatMap タグ展開 + 分割代入 props + 特殊文字データ)を題材に、SSR HTML とハイドレーション後の DOM・挙動を実 Chromium で突き合わせた監査。

**結論と再現手順は [REPORT.md](./REPORT.md) を参照。**

```sh
bun install
bun run --filter '@barefootjs/client' build
bun run explorations/tagged-todo/harness/compile.ts    # コンパイル + 状態別 SSR HTML
bun run explorations/tagged-todo/harness/audit.ts      # シナリオ監査(SSR vs hydrated DOM)
bun run explorations/tagged-todo/repros/repro-runner.ts # 最小再現の一括検証
```

- `TaggedTodoTable.tsx` — 監査対象コンポーネント
- `harness/` — コンパイル・SSR・ブラウザ突き合わせの各スクリプト
- `repros/` — レポートの各バグ候補の最小再現
- `out/` — 生成物(git 管理外・上記コマンドで再生成)
