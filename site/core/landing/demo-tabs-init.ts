/**
 * Manual switching for the landing hero's demo via its two native
 * `<select>`s: the active example (left source pane) and the active adapter
 * (right output pane); the visible output panel is always example × adapter.
 * Progressive enhancement: without JS the first example/adapter stays
 * visible. No auto-rotation.
 *
 * Installed once from the landing layout's `<head>` as a delegated `change`
 * listener on `document` (the same shape as `docsTabsInitScript`), not as an
 * inline `<script>` next to the demo: the demo sits inside the layout's
 * `bf-region`, and markup the router swaps in never executes its scripts, so
 * a soft navigation into `/` would leave an inline script's listeners
 * unbound.
 */
export const demoTabsInitScript = `(function () {
  document.addEventListener('change', function (e) {
    var select = e.target;
    if (!select || !select.matches || !select.matches('.demo-frame select[data-select]')) return;
    var frame = select.closest('.demo-frame');
    var exSelect = frame.querySelector('select[data-select="example"]');
    var adSelect = frame.querySelector('select[data-select="adapter"]');
    if (!exSelect || !adSelect) return;
    var example = exSelect.value;
    var adapter = adSelect.value;
    frame.querySelectorAll('.src-panel').forEach(function (p) {
      p.classList.toggle('active', p.dataset.example === example);
    });
    frame.querySelectorAll('.out-panel').forEach(function (p) {
      p.classList.toggle('active', p.dataset.panel === example + '-' + adapter);
    });
  });
})();`
