/**
 * PoC: Declarative Partial Updates (DPU) を使った Out-of-Order Streaming swap
 *
 * 目的:
 *   Barefoot の現行 OOS ストリーミング（`<div bf-async>` + `<template bf-async-resolve>`
 *   + `<script>__bf_swap()</script>` の手書き swap）を、ブラウザネイティブの
 *   Declarative Partial Updates で「JS なしで」置き換えられるかを検証する。
 *
 * 検証する命題:
 *   同一マークアップが
 *     (A) DPU 対応ブラウザでは <?start>/<?end> + <template for> によりネイティブに、
 *     (B) 非対応ブラウザでは <?start>/<?end> が bogus comment に降格 → それを
 *         コメント範囲として JS が swap する（= Barefoot の bf-loop / __bf_swap と同型）、
 *   の両方で同じ結果になること。
 *
 * 実行:  bun run experiments/dpu-oos-poc/server.ts
 * 観測:  http://localhost:8787 を開く
 *   - Chrome 148+ で chrome://flags/#enable-experimental-web-platform-features を ON
 *     → JS フォールバックは発火せず（バッジが "native DPU"）パッチが当たる
 *   - フラグ OFF / 他ブラウザ
 *     → コメント範囲フォールバックが発火（バッジが "JS fallback"）して同じ結果になる
 *
 * curl で「ストリームが時間差で届く」ことだけ確認したい場合:
 *   curl --no-buffer http://localhost:8787
 */

const PORT = 8787

const enc = new TextEncoder()

/** 1つの非同期境界の「解決」チャンク（時間差で flush される本体）。 */
function resolvedChunk(name: string, label: string): string {
  const serverTime = new Date().toISOString()
  return (
    // <template for="<name>"> が DPU の本体。name でプレースホルダに対応づく。
    `<template for="${name}">` +
    `<div class="resolved" data-resolved="${name}">` +
    `<strong>${label} resolved ✅</strong> ` +
    `<small>server time ${serverTime}</small>` +
    `</div>` +
    `</template>` +
    // 非対応ブラウザ向けの保険。DPU が当たっていれば no-op になる。
    // Barefoot の `<script>__bf_swap("a0")</script>` と同じ役割。
    `<script>window.__bf_dpu_fallback && window.__bf_dpu_fallback(${JSON.stringify(name)})</script>\n`
  )
}

/** プレースホルダ（範囲マーカー + フォールバック内容）。 */
function placeholder(name: string, label: string): string {
  // <?start name>/<?end> は DPU 対応ブラウザでは ProcessingInstruction、
  // 非対応では bogus comment <!--?start name="a0"--> ... <!--?end--> に降格する。
  // data-bf-fallback は「まだ解決されていない」ことを示すセンチネル。
  // DPU が範囲を置換すれば消えるので、フォールバック発火条件の判定に使う。
  return (
    `<?start name="${name}">` +
    `<span class="pending" data-bf-fallback="${name}">⏳ ${label} loading…</span>` +
    `<?end>`
  )
}

const head = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>DPU OOS swap PoC</title>
<style>
  body { font: 16px/1.6 system-ui, sans-serif; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  section { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
  .pending { color: #b45309; }
  .resolved { color: #166534; }
  #mode { padding: .25rem .5rem; border-radius: 4px; background: #eee; font-size: .85rem; }
  .native { background: #dcfce7 !important; }
  .fallback { background: #fef9c3 !important; }
</style>
</head>
<body>
<h1>DPU で OOS streaming swap</h1>
<p>適用経路: <span id="mode">measuring…</span></p>
`

/**
 * フォールバック実装。
 *
 * - DPU が効いていれば data-bf-fallback のセンチネルは消えているので no-op。
 * - 効いていなければ、bogus comment に降格した <!--?start name="x"--> ...
 *   <!--?end--> の範囲を走査し、<template for="x"> の内容で置換する。
 *   これは Barefoot の bf-loop コメント範囲スキャンと同じ走査パターン。
 */
const fallbackScript = `<script>
(function () {
  var usedFallback = false;

  function findComment(pred) {
    var w = document.createTreeWalker(document.body, NodeFilter.SHOW_COMMENT);
    var n;
    while ((n = w.nextNode())) { if (pred(n)) return n; }
    return null;
  }

  window.__bf_dpu_fallback = function (name) {
    // センチネルが残っている = DPU は適用されなかった。
    var pending = document.querySelector('[data-bf-fallback="' + name + '"]');
    if (!pending) return; // ネイティブ DPU が既に置換済み → 何もしない

    var tmpl = document.querySelector('template[for="' + name + '"]');
    if (!tmpl) return;

    // bogus comment に降格した範囲マーカーを探す。
    var startData = '?start name="' + name + '"';
    var start = findComment(function (c) { return c.nodeValue.trim() === startData; });
    var end = findComment(function (c) { return c.nodeValue.trim() === '?end'; });

    if (start && end && start.parentNode === end.parentNode) {
      // start と end の間のノードを撤去して template 内容を差し込む。
      var node = start.nextSibling;
      while (node && node !== end) { var next = node.nextSibling; node.remove(); node = next; }
      end.parentNode.insertBefore(tmpl.content.cloneNode(true), end);
    } else {
      // 範囲が取れない場合はセンチネル位置で素朴に置換。
      pending.replaceWith(tmpl.content.cloneNode(true));
    }
    tmpl.remove();
    usedFallback = true;
    setMode();
  };

  function setMode() {
    var el = document.getElementById('mode');
    if (!el) return;
    if (usedFallback) { el.textContent = 'JS fallback (comment-range swap)'; el.className = 'fallback'; }
    else { el.textContent = 'native DPU (no JS swap)'; el.className = 'native'; }
  }

  // 全チャンク到着後、フォールバックを一度も使っていなければネイティブ判定。
  window.addEventListener('load', function () { if (!usedFallback) setMode(); });
})();
</script>
`

function stream(): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const push = (s: string) => controller.enqueue(enc.encode(s))
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

      // 1) 初期レスポンス: head + フォールバックscript + 2つのプレースホルダ。
      push(head)
      push(fallbackScript)
      push(`<section>${placeholder('a0', 'Product detail')}</section>\n`)
      push(`<section>${placeholder('a1', 'Reviews')}</section>\n`)

      // 2) 解決を out-of-order に流す（a1 が先に解決するケースを再現）。
      await sleep(1200)
      push(resolvedChunk('a1', 'Reviews'))

      await sleep(800)
      push(resolvedChunk('a0', 'Product detail'))

      // 3) 終端。
      push(`</body></html>`)
      controller.close()
    },
  })
}

Bun.serve({
  port: PORT,
  fetch() {
    return new Response(stream(), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  },
})

console.log(`DPU OOS PoC: http://localhost:${PORT}`)
