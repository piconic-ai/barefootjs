/**
 * Hero section with code comparison demo
 */

import { highlight, initHighlighter } from './shared/highlighter'
import { SOURCE_CODE, HONO_OUTPUT, ECHO_OUTPUT, CLIENT_CODE } from './shared/snippets'

async function highlightCode(code: string, lang: 'tsx' | 'javascript' | 'html') {
  await initHighlighter()
  const html = highlight(code, lang)
  // Wrap in shiki structure for consistent styling
  return `<pre class="shiki shiki-themes github-light github-dark" style="background-color:#fff;--shiki-dark-bg:#24292e;color:#24292e;--shiki-dark:#e1e4e8" tabindex="0"><code>${html}</code></pre>`
}

async function CodeComparisonDemo() {
  // Code snippets are embedded as module (Workers-compatible)

  // Highlight all code snippets
  const sourceHtml = await highlightCode(SOURCE_CODE, 'tsx')
  const honoHtml = await highlightCode(HONO_OUTPUT, 'tsx')
  const echoHtml = await highlightCode(ECHO_OUTPUT, 'html')
  const clientHtml = await highlightCode(CLIENT_CODE, 'javascript')

  const html = `
    <div class="code-demo" id="code-demo">
      <!-- Source Panel (Left) -->
      <div class="code-panel source-panel" id="source-panel">
        <div class="code-header">
          <div class="code-tabs">
            <button class="code-tab active" id="tab-source">Counter.tsx</button>
          </div>
        </div>
        <div class="code-content">${sourceHtml}</div>
      </div>

      <!-- Resizer -->
      <div class="resizer" id="resizer"></div>

      <!-- Output Panel (Right) -->
      <div class="code-panel output-panel" id="output-panel">
        <div class="code-header">
          <div class="code-tabs">
            <button class="code-tab active" data-output="template" id="tab-template">Template</button>
            <button class="code-tab" data-output="client" id="tab-client">client.js</button>
          </div>
          <select class="backend-select" id="backend-select">
            <option value="hono" selected>Hono</option>
            <option value="echo">Echo</option>
          </select>
        </div>
        <div class="code-content" id="output-content">
          <div class="output-code" id="output-hono">${honoHtml}</div>
          <div class="output-code" id="output-echo" style="display: none;">${echoHtml}</div>
          <div class="output-code" id="output-client" style="display: none;">${clientHtml}</div>
        </div>
      </div>

      <script>
        (function() {
          var backendSelect = document.getElementById('backend-select');
          var outputHono = document.getElementById('output-hono');
          var outputEcho = document.getElementById('output-echo');
          var outputClient = document.getElementById('output-client');
          var tabTemplate = document.getElementById('tab-template');
          var tabClient = document.getElementById('tab-client');

          var currentOutput = 'template';
          var currentBackend = 'hono';

          function updateOutputDisplay() {
            outputHono.style.display = 'none';
            outputEcho.style.display = 'none';
            outputClient.style.display = 'none';

            if (currentOutput === 'template') {
              backendSelect.style.display = 'block';
              if (currentBackend === 'hono') {
                outputHono.style.display = 'block';
              } else {
                outputEcho.style.display = 'block';
              }
            } else {
              backendSelect.style.display = 'none';
              outputClient.style.display = 'block';
            }
          }

          function switchOutput(type) {
            currentOutput = type;
            tabTemplate.classList.toggle('active', type === 'template');
            tabClient.classList.toggle('active', type === 'client');
            updateOutputDisplay();
          }

          function switchBackend(backend) {
            currentBackend = backend;
            updateOutputDisplay();
          }

          tabTemplate.addEventListener('click', function() { switchOutput('template'); });
          tabClient.addEventListener('click', function() { switchOutput('client'); });
          backendSelect.addEventListener('change', function() { switchBackend(this.value); });

          // Resizer functionality
          var resizer = document.getElementById('resizer');
          var sourcePanel = document.getElementById('source-panel');
          var outputPanel = document.getElementById('output-panel');
          var codeDemo = document.getElementById('code-demo');

          var isResizing = false;
          var minWidth = 120;
          var blurThreshold = 180;

          function updateBlurState() {
            var sourceWidth = sourcePanel.getBoundingClientRect().width;
            var outputWidth = outputPanel.getBoundingClientRect().width;
            if (sourceWidth <= blurThreshold) {
              sourcePanel.classList.add('blurred');
            } else {
              sourcePanel.classList.remove('blurred');
            }
            if (outputWidth <= blurThreshold) {
              outputPanel.classList.add('blurred');
            } else {
              outputPanel.classList.remove('blurred');
            }
          }

          // Initial blur state
          setTimeout(updateBlurState, 100);

          resizer.addEventListener('mousedown', function(e) {
            isResizing = true;
            resizer.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
          });

          document.addEventListener('mousemove', function(e) {
            if (!isResizing) return;

            var containerRect = codeDemo.getBoundingClientRect();
            var containerWidth = containerRect.width;
            var offsetX = e.clientX - containerRect.left;

            var maxWidth = containerWidth - minWidth - 1;

            var newSourceWidth = Math.max(minWidth, Math.min(maxWidth, offsetX));
            var newOutputWidth = containerWidth - newSourceWidth - 1;

            sourcePanel.style.flex = 'none';
            sourcePanel.style.width = newSourceWidth + 'px';
            outputPanel.style.flex = 'none';
            outputPanel.style.width = newOutputWidth + 'px';

            updateBlurState();
          });

          document.addEventListener('mouseup', function() {
            if (isResizing) {
              isResizing = false;
              resizer.classList.remove('dragging');
              document.body.style.cursor = '';
              document.body.style.userSelect = '';
            }
          });
        })();
      </script>
    </div>
  `

  return <div dangerouslySetInnerHTML={{ __html: html }} />
}

export async function Hero() {
  const codeDemo = await CodeComparisonDemo()

  return (
    <section className="min-h-screen flex items-center px-6 sm:px-12 pt-20 pb-12">
      <div className="w-full max-w-7xl mx-auto grid lg:grid-cols-2 gap-6 items-center">
        {/* Left: Headline */}
        <div>
          <h1 className="fade-in text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground mb-6">
            Reactive TSX for <span className="gradient-text whitespace-nowrap">any backend</span>
          </h1>
          <p className="fade-in-1 text-lg text-muted-foreground mb-8 max-w-lg">
            Write TSX with signals. Compile to templates your backend understands.
            No VDOM on the client, just selective hydration.
          </p>
          <div className="fade-in-2 flex flex-wrap gap-3">
            <a
              href="/docs/introduction"
              className="btn-primary"
            >
              Get Started
            </a>
            <a
              href="https://github.com/barefootjs/barefootjs"
              className="btn-secondary"
            >
              GitHub
            </a>
          </div>
        </div>

        {/* Right: Code Comparison Demo */}
        <div className="fade-in-3 min-w-0 overflow-hidden">
          {codeDemo}
        </div>
      </div>
    </section>
  )
}
