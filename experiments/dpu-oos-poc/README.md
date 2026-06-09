# PoC: DPU を使った OOS streaming swap

Barefoot の現行 Out-of-Order Streaming（OOS）は、クライアント JS による手書き swap です：

```html
<div bf-async="a0">…fallback…</div>
<template bf-async-resolve="a0">…resolved…</template>
<script>__bf_swap("a0")</script>
```

`__bf_swap`（`packages/client/src/runtime/streaming.ts`）が `querySelector` →
`replaceChildren` → template 除去を手動でやっています。

[Declarative Partial Updates (DPU)](https://developer.chrome.com/blog/declarative-partial-updates)
は、これを **ブラウザネイティブ・JS なし** で行う提案です：

```html
<?start name="a0">…fallback…<?end>
<template for="a0">…resolved…</template>
```

この PoC は「**同一マークアップが、DPU 対応ブラウザではネイティブに、非対応では
コメント範囲ベースの JS フォールバックで、同じ結果になる**」ことを検証します。

## 実行

```bash
bun run experiments/dpu-oos-poc/server.ts
# → http://localhost:8787
```

サーバは out-of-order に時間差でチャンクを流します（検証済み）：

```
+0.02s  HEAD/body flushed       … 初期レスポンス（プレースホルダ2つ）
+1.21s  a1 resolved chunk       … <template for="a1"> を後追いで flush
+2.01s  a0 resolved chunk       … <template for="a0"> を後追いで flush
```

## 観測ポイント

ページ上部の「適用経路」バッジが、どちらの経路で swap されたかを示します。

### (A) ネイティブ DPU 経路

- **Chrome 148+**（Canary 推奨）で `chrome://flags/#enable-experimental-web-platform-features`
  を **Enabled** にして再起動。
- プレースホルダが JS を介さずパッチされ、バッジが **`native DPU (no JS swap)`**（緑）。
- `<?start>/<?end>` は `ProcessingInstruction` ノードとしてパースされ、`<template for>`
  到着時にブラウザが範囲を置換します。フォールバック script は
  `data-bf-fallback` センチネルが既に消えているので **no-op**。

### (B) JS フォールバック経路

- フラグ OFF、または Firefox / Safari / 旧 Chrome。
- `<?start name="a0">` は **bogus comment** `<!--?start name="a0"-->` に降格。
- 各 `<template for>` 直後の `<script>__bf_dpu_fallback("a0")</script>` が、
  `<!--?start-->` … `<!--?end-->` の**コメント範囲**を走査して template 内容で置換。
  バッジは **`JS fallback (comment-range swap)`**（黄）。

両経路で最終 DOM は同一になります。

## なぜこれが Barefoot にとって意味があるか

このフォールバックのコメント範囲走査は、Barefoot が既に持っている仕組みと**同型**です：

- ループ境界 `<!--bf-loop:id-->` … `<!--bf-/loop:id-->`（`packages/shared/src/markers.ts`）
- OOS swap の `__bf_swap`（`packages/client/src/runtime/streaming.ts`）

つまり Barefoot は DPU 標準化より前に同じ設計に到達しており、DPU 対応ブラウザでは
この層を**ネイティブに肩代わりさせられる**可能性がある、というのが本 PoC の主旨です。

## スコープ（できること / できないこと）

- ✅ サーバ push 型の OOS swap（本 PoC が対象）
- ❌ 制御構文（for / if）の生成責務 — これはバックエンドテンプレ側に残る
- ❌ シグナルによるクライアントローカルな局所更新 — サーバ往復が要るため DPU 対象外

## ブラウザ状況（2026-06 時点）

- Chrome 148+ のフラグ裏のみ。Firefox / Safari のシグナルなし。**production 不可**。
- したがって採用するなら **progressive enhancement**（capability があればネイティブ、
  なければ現行 `__bf_swap` フォールバック）が前提。本 PoC のマークアップは
  そのまま両対応になっている。

## 参考

- [Declarative partial updates — Chrome for Developers](https://developer.chrome.com/blog/declarative-partial-updates)
- [WICG/declarative-partial-updates patching-explainer.md](https://github.com/WICG/declarative-partial-updates/blob/main/patching-explainer.md)
- [chromestatus: Declarative Document Patching](https://chromestatus.com/feature/5111042975465472)
