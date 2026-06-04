/**
 * BarefootJS Playground — host Worker.
 *
 * Receives requests and dispatches them into a *dynamically loaded* Worker
 * (Cloudflare Dynamic Workers / the `worker_loaders` binding). The loaded
 * Worker runs in a fresh, isolated V8 isolate with no network access
 * (`globalOutbound: null`), which is where the user's compiled app code runs.
 *
 * Live recompile loop (Phase 4):
 *   1. The browser collects every editor file and posts them to the in-browser
 *      compile worker (served at /_pg/compile-worker.js), which runs
 *      compileAppCore + @barefootjs/jsx + UnoCSS + esbuild-wasm and returns the
 *      USER modules (server, renderer, compiled component, inline assets).
 *   2. The browser POSTs those to `/_pg/build`; the host stashes them per
 *      session (cookie `bf_pg_session`).
 *   3. `/_preview` + the app catch-all merge the session's user modules with the
 *      FIXED vendor modules (object-form, from generated/vendor-bundle) and load
 *      them into a Dynamic Worker keyed by the session id, then dispatch.
 *
 * Routing (order matters):
 *   - /__host_health   served by the host worker itself.
 *   - /__spike         loads a trivial module (proves the Loader machinery).
 *   - GET /            the playground UI shell.
 *   - GET /_pg/files | /_pg/types-bundle.json | /_pg/app.js  UI feeds.
 *   - GET /_pg/compile-worker.js | /_pg/barefoot-runtime.js  browser-compile assets.
 *   - POST /_pg/build  stash a session's compiled user modules + assets.
 *   - /__rt-static/*   host-served static assets (barefoot.js, <Name>.client.js,
 *                      uno.css) from the session's stored assets.
 *   - /_preview[/]     rewritten to `/` and dispatched into the session app.
 *   - everything else  dispatched UNCHANGED into the session app (page routes
 *                      like /, /counter, /todo from the preview URL bar). If the
 *                      session has not built yet, the default multi-route app
 *                      (compiled by compileApp at build time, embedded as
 *                      generated/rt-counter.ts) is loaded instead.
 *
 * NOTE: sessions live in an in-memory Map. A V8 isolate is ephemeral, so this
 * is fine for local dev / a single warm isolate; production must persist
 * sessions in a Durable Object (the Map would be lost on isolate eviction and
 * would not be shared across isolates).
 */

import { APP_FILES } from './generated/app-files'
import { TYPES_BUNDLE } from './generated/types-bundle'
import {
  RT_COUNTER_MAIN,
  RT_COUNTER_MODULES,
  RT_COUNTER_ASSETS,
  type RtAppAssets,
} from './generated/rt-counter'
import { COMPILE_WORKER_JS, BAREFOOT_RUNTIME_JS } from './generated/compile-worker'
import { VENDOR_JS, VENDOR_SHIMS } from './generated/vendor-bundle'
import {
  REGISTRY_MODULES,
  REGISTRY_CLIENT_JS,
} from './generated/registry-bundle'
import { TOKENS_CSS } from './generated/tokens-bundle'
import { UI_SHELL_HTML, UI_CLIENT_JS } from './ui'
import { handleChat, type AiBinding } from './agent'
import { Hono } from 'hono'
import { setCookie } from 'hono/cookie'
import { DurableObject } from 'cloudflare:workers'

interface WorkerLoaderModules {
  // Plain string = ESM source (key must end .js/.py). Object form
  // ({ js } / { text } / …) lets a module be keyed by ANY name, including a
  // bare specifier — which is how the pre-bundled framework is provided.
  [path: string]: string | { js: string }
}

interface WorkerCode {
  compatibilityDate: string
  compatibilityFlags?: string[]
  mainModule: string
  modules: WorkerLoaderModules
  // null fully severs outbound network for the loaded (untrusted) code.
  globalOutbound?: unknown | null
  env?: Record<string, unknown>
}

interface WorkerStub {
  getEntrypoint(): { fetch(request: Request): Promise<Response> }
}

interface WorkerLoader {
  get(id: string, supplier: () => Promise<WorkerCode>): WorkerStub
  load(code: WorkerCode): WorkerStub
}

interface Env {
  LOADER: WorkerLoader
  // Workers AI binding (see wrangler.jsonc). Absent in local dev, which routes
  // the chat endpoint into MOCK mode (see agent.ts).
  AI?: AiBinding
  // Per-session state (one DO instance per session id). See PlaygroundSession.
  PLAYGROUND_SESSION: DurableObjectNamespace<PlaygroundSession>
}

// A compiled session, persisted in a Durable Object. barefoot.js is NOT stored
// here — it is the fixed DOM runtime, served from BAREFOOT_RUNTIME_JS — which
// keeps the stored value well under the 128 KiB DO value limit.
interface StoredSession {
  mainModule: string
  userModules: Record<string, string>
  // The app's generated UnoCSS (user-dependent: only the classes this app uses).
  unoCss: string
  // Per-user-component hydration JS, keyed by component name. (Registry
  // components' client JS is fixed — served from REGISTRY_CLIENT_JS.)
  clientJs: Record<string, string>
  // Monotonic build counter, appended to the Loader cache key so each Run loads
  // a fresh isolate rather than reusing the previous build for the same session.
  generation: number
}

// Evict a session this long after its last build (the alarm is refreshed on
// every build).
const SESSION_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Per-session state — one DO instance per session id (`idFromName`). Strongly
 * consistent and isolate-independent: a build is immediately visible to the
 * next preview request and survives isolate eviction, unlike the in-memory Map
 * this replaces (which was lost on every cold start and not shared across
 * isolates).
 */
export class PlaygroundSession extends DurableObject {
  async putBuild(build: Omit<StoredSession, 'generation'>): Promise<void> {
    const prev = await this.ctx.storage.get<StoredSession>('session')
    await this.ctx.storage.put('session', {
      ...build,
      generation: (prev?.generation ?? 0) + 1,
    })
    await this.ctx.storage.setAlarm(Date.now() + SESSION_TTL_MS)
  }

  async getSession(): Promise<StoredSession | null> {
    return (await this.ctx.storage.get<StoredSession>('session')) ?? null
  }

  // TTL cleanup: drop the session once the alarm fires without a newer build.
  async alarm(): Promise<void> {
    await this.ctx.storage.deleteAll()
  }
}

// Static asset URL convention. MUST match compile-app-core.ts's STATIC_BASE /
// UNO_CSS_PATH (the renderer's import map + the per-component script tags point
// here). Duplicated as plain constants rather than imported so the host worker
// bundle does not pull in the compiler (@unocss/core, @barefootjs/jsx, …).
const STATIC_BASE = '/__rt-static/components/'
const UNO_CSS_PATH = '/__rt-static/uno.css'
const TOKENS_CSS_PATH = '/__rt-static/tokens.css'

// The Barefoot.js wordmark (white), served at /_pg/logo.svg for the header.
// Inlined as a constant because this Worker has no static-assets directory.
// Mirrors site/core's logo-for-dark.svg so the header matches barefootjs.dev.
const LOGO_SVG = `<svg viewBox="0 0 200 46" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
<path d="M199.488 18.7273L197.636 19.25C197.454 18.7273 197.196 18.2538 196.863 17.8296C196.53 17.4053 196.094 17.0682 195.556 16.8182C195.026 16.5682 194.367 16.4432 193.579 16.4432C192.397 16.4432 191.427 16.7235 190.67 17.2841C189.912 17.8447 189.534 18.5682 189.534 19.4546C189.534 20.2046 189.791 20.8144 190.306 21.2841C190.829 21.7462 191.632 22.1137 192.715 22.3864L195.352 23.0341C196.814 23.3902 197.909 23.9546 198.636 24.7273C199.371 25.5 199.738 26.4697 199.738 27.6364C199.738 28.6212 199.465 29.4962 198.92 30.2614C198.374 31.0265 197.613 31.6288 196.636 32.0682C195.666 32.5 194.541 32.7159 193.261 32.7159C191.556 32.7159 190.151 32.3334 189.045 31.5682C187.939 30.7955 187.23 29.6818 186.92 28.2273L188.863 27.75C189.113 28.7879 189.602 29.572 190.329 30.1023C191.064 30.6326 192.03 30.8978 193.227 30.8978C194.568 30.8978 195.64 30.5985 196.443 30C197.246 29.394 197.647 28.6364 197.647 27.7273C197.647 27.0228 197.412 26.4318 196.943 25.9546C196.473 25.4697 195.761 25.1137 194.806 24.8864L191.954 24.2046C190.439 23.8409 189.318 23.2652 188.59 22.4773C187.863 21.6894 187.499 20.7121 187.499 19.5455C187.499 18.5834 187.761 17.7387 188.284 17.0114C188.806 16.2765 189.526 15.7008 190.443 15.2841C191.359 14.8675 192.405 14.6591 193.579 14.6591C195.177 14.6591 196.454 15.0228 197.409 15.75C198.371 16.4697 199.064 17.4621 199.488 18.7273Z" fill="#ffffff"/>
<path d="M181.337 14.8977H183.371V34.0455C183.371 35.0379 183.186 35.894 182.815 36.6136C182.451 37.3409 181.921 37.9015 181.224 38.2955C180.527 38.697 179.686 38.8977 178.701 38.8977C178.625 38.8977 178.549 38.8977 178.474 38.8977C178.398 38.8977 178.315 38.894 178.224 38.8864L178.246 36.9886C178.322 36.9886 178.394 36.9886 178.462 36.9886C178.53 36.9886 178.602 36.9886 178.678 36.9886C179.512 36.9886 180.163 36.7311 180.633 36.2159C181.102 35.7008 181.337 34.9773 181.337 34.0455V14.8977ZM182.337 11.8977C181.928 11.8977 181.572 11.7576 181.269 11.4773C180.974 11.1894 180.826 10.8447 180.826 10.4432C180.826 10.0417 180.974 9.70077 181.269 9.42047C181.572 9.13259 181.928 8.98865 182.337 8.98865C182.754 8.98865 183.11 9.13259 183.405 9.42047C183.708 9.70077 183.86 10.0417 183.86 10.4432C183.86 10.8447 183.708 11.1894 183.405 11.4773C183.11 11.7576 182.754 11.8977 182.337 11.8977Z" fill="#ffffff"/>
<path d="M175.294 32.5228C174.847 32.5228 174.461 32.3637 174.135 32.0455C173.817 31.7197 173.658 31.3334 173.658 30.8864C173.658 30.4318 173.817 30.0455 174.135 29.7273C174.461 29.4091 174.847 29.25 175.294 29.25C175.749 29.25 176.135 29.4091 176.454 29.7273C176.772 30.0455 176.931 30.4318 176.931 30.8864C176.931 31.1818 176.855 31.4546 176.704 31.7046C176.56 31.9546 176.363 32.1553 176.113 32.3068C175.87 32.4508 175.597 32.5228 175.294 32.5228Z" fill="#ffffff"/>
<path d="M170.047 14.8978V16.6591H161.717V14.8978H170.047ZM164.32 10.7159H166.354V27.7955C166.354 28.5228 166.479 29.0947 166.729 29.5114C166.979 29.9205 167.305 30.2122 167.706 30.3864C168.108 30.5531 168.536 30.6364 168.99 30.6364C169.255 30.6364 169.483 30.6212 169.672 30.5909C169.861 30.5531 170.028 30.5152 170.172 30.4773L170.604 32.3069C170.407 32.3826 170.164 32.4508 169.877 32.5114C169.589 32.5796 169.233 32.6137 168.808 32.6137C168.066 32.6137 167.35 32.4508 166.661 32.125C165.979 31.7993 165.418 31.3144 164.979 30.6705C164.539 30.0265 164.32 29.2273 164.32 28.2728V10.7159Z" fill="#ffffff"/>
<path d="M152.01 32.7159C150.502 32.7159 149.169 32.3334 148.01 31.5682C146.858 30.8031 145.957 29.7462 145.305 28.3978C144.654 27.0417 144.328 25.4773 144.328 23.7046C144.328 21.9167 144.654 20.3447 145.305 18.9887C145.957 17.625 146.858 16.5644 148.01 15.8068C149.169 15.0417 150.502 14.6591 152.01 14.6591C153.517 14.6591 154.847 15.0417 155.999 15.8068C157.15 16.572 158.052 17.6326 158.703 18.9887C159.362 20.3447 159.692 21.9167 159.692 23.7046C159.692 25.4773 159.366 27.0417 158.714 28.3978C158.063 29.7462 157.158 30.8031 155.999 31.5682C154.847 32.3334 153.517 32.7159 152.01 32.7159ZM152.01 30.8637C153.222 30.8637 154.249 30.5379 155.089 29.8864C155.93 29.2349 156.567 28.3675 156.999 27.2841C157.438 26.2008 157.658 25.0076 157.658 23.7046C157.658 22.4015 157.438 21.2046 156.999 20.1137C156.567 19.0228 155.93 18.1478 155.089 17.4887C154.249 16.8296 153.222 16.5 152.01 16.5C150.805 16.5 149.779 16.8296 148.93 17.4887C148.089 18.1478 147.449 19.0228 147.01 20.1137C146.578 21.2046 146.362 22.4015 146.362 23.7046C146.362 25.0076 146.578 26.2008 147.01 27.2841C147.449 28.3675 148.089 29.2349 148.93 29.8864C149.771 30.5379 150.798 30.8637 152.01 30.8637Z" fill="#ffffff"/>
<path d="M134.064 32.7159C132.556 32.7159 131.223 32.3334 130.064 31.5682C128.912 30.8031 128.011 29.7462 127.359 28.3978C126.708 27.0417 126.382 25.4773 126.382 23.7046C126.382 21.9167 126.708 20.3447 127.359 18.9887C128.011 17.625 128.912 16.5644 130.064 15.8068C131.223 15.0417 132.556 14.6591 134.064 14.6591C135.571 14.6591 136.901 15.0417 138.052 15.8068C139.204 16.572 140.105 17.6326 140.757 18.9887C141.416 20.3447 141.745 21.9167 141.745 23.7046C141.745 25.4773 141.42 27.0417 140.768 28.3978C140.117 29.7462 139.211 30.8031 138.052 31.5682C136.901 32.3334 135.571 32.7159 134.064 32.7159ZM134.064 30.8637C135.276 30.8637 136.302 30.5379 137.143 29.8864C137.984 29.2349 138.62 28.3675 139.052 27.2841C139.492 26.2008 139.711 25.0076 139.711 23.7046C139.711 22.4015 139.492 21.2046 139.052 20.1137C138.62 19.0228 137.984 18.1478 137.143 17.4887C136.302 16.8296 135.276 16.5 134.064 16.5C132.859 16.5 131.833 16.8296 130.984 17.4887C130.143 18.1478 129.503 19.0228 129.064 20.1137C128.632 21.2046 128.416 22.4015 128.416 23.7046C128.416 25.0076 128.632 26.2008 129.064 27.2841C129.503 28.3675 130.143 29.2349 130.984 29.8864C131.825 30.5379 132.852 30.8637 134.064 30.8637Z" fill="#ffffff"/>
<path d="M124.921 14.8977V16.6591H116.342V14.8977H124.921ZM119.024 32.3523V12.3409C119.024 11.4015 119.24 10.6098 119.671 9.96591C120.111 9.32197 120.683 8.83333 121.387 8.5C122.092 8.16667 122.838 8 123.626 8C124.156 8 124.596 8.04545 124.944 8.13636C125.3 8.2197 125.58 8.30303 125.785 8.38636L125.194 10.1591C125.043 10.1136 124.857 10.0606 124.637 10C124.418 9.93939 124.141 9.90909 123.808 9.90909C122.929 9.90909 122.251 10.1553 121.774 10.6477C121.296 11.1402 121.058 11.8447 121.058 12.7614L121.046 32.3523H119.024Z" fill="#ffffff"/>
<path d="M107.163 32.7159C105.534 32.7159 104.125 32.3371 102.935 31.5796C101.746 30.8144 100.825 29.7576 100.174 28.4091C99.53 27.0531 99.2081 25.4925 99.2081 23.7273C99.2081 21.9697 99.53 20.4091 100.174 19.0455C100.825 17.6743 101.723 16.6023 102.867 15.8296C104.019 15.0493 105.348 14.6591 106.856 14.6591C107.803 14.6591 108.716 14.8334 109.594 15.1818C110.473 15.5228 111.261 16.0493 111.958 16.7614C112.663 17.4659 113.219 18.3561 113.629 19.4318C114.038 20.5 114.242 21.7652 114.242 23.2273V24.2273H100.606V22.4432H112.174C112.174 21.322 111.947 20.3144 111.492 19.4205C111.045 18.519 110.42 17.8068 109.617 17.2841C108.822 16.7614 107.901 16.5 106.856 16.5C105.75 16.5 104.776 16.7955 103.935 17.3864C103.094 17.9773 102.435 18.7576 101.958 19.7273C101.488 20.697 101.25 21.7576 101.242 22.9091V23.9773C101.242 25.3637 101.481 26.5758 101.958 27.6137C102.443 28.644 103.129 29.4432 104.015 30.0114C104.901 30.5796 105.95 30.8637 107.163 30.8637C107.988 30.8637 108.712 30.7349 109.333 30.4773C109.962 30.2197 110.488 29.875 110.913 29.4432C111.344 29.0038 111.67 28.5228 111.89 28L113.81 28.625C113.545 29.3599 113.11 30.0379 112.504 30.6591C111.905 31.2803 111.155 31.7803 110.254 32.1591C109.36 32.5303 108.329 32.7159 107.163 32.7159Z" fill="#ffffff"/>
<path d="M90.1908 32.3523V14.8978H92.1567V17.5796H92.3044C92.6529 16.7008 93.259 15.9925 94.1226 15.4546C94.9938 14.9091 95.9787 14.6364 97.0772 14.6364C97.2438 14.6364 97.4294 14.6402 97.634 14.6478C97.8385 14.6554 98.009 14.6629 98.1453 14.6705V16.7273C98.0544 16.7122 97.8953 16.6894 97.6681 16.6591C97.4408 16.6288 97.1946 16.6137 96.9294 16.6137C96.0203 16.6137 95.2097 16.8069 94.4976 17.1932C93.7931 17.572 93.2363 18.0985 92.8272 18.7728C92.4181 19.447 92.2135 20.216 92.2135 21.0796V32.3523H90.1908Z" fill="#ffffff"/>
<path d="M78.2133 32.75C77.1603 32.75 76.1981 32.5455 75.3269 32.1364C74.4557 31.7197 73.7625 31.1212 73.2474 30.3409C72.7322 29.5531 72.4747 28.5985 72.4747 27.4773C72.4747 26.6137 72.6375 25.8864 72.9633 25.2955C73.289 24.7046 73.7512 24.2197 74.3497 23.8409C74.9481 23.4621 75.6565 23.1629 76.4747 22.9432C77.2928 22.7235 78.1944 22.5531 79.1792 22.4318C80.1565 22.3106 80.9822 22.2046 81.6565 22.1137C82.3383 22.0228 82.8572 21.8788 83.2133 21.6818C83.5694 21.4849 83.7474 21.1667 83.7474 20.7273V20.3182C83.7474 19.1288 83.3913 18.1932 82.6792 17.5114C81.9747 16.822 80.9595 16.4773 79.6337 16.4773C78.3762 16.4773 77.3497 16.7538 76.5542 17.3068C75.7663 17.8599 75.2133 18.5114 74.8951 19.2614L72.9747 18.5682C73.3686 17.6137 73.914 16.8523 74.611 16.2841C75.308 15.7084 76.0883 15.2955 76.9519 15.0455C77.8156 14.7879 78.6906 14.6591 79.5769 14.6591C80.2436 14.6591 80.9368 14.7462 81.6565 14.9205C82.3837 15.0947 83.058 15.3978 83.6792 15.8296C84.3004 16.2538 84.8042 16.8485 85.1906 17.6137C85.5769 18.3712 85.7701 19.3334 85.7701 20.5V32.3523H83.7474V29.5909H83.6224C83.38 30.1061 83.0201 30.6061 82.5428 31.0909C82.0656 31.5758 81.4671 31.9735 80.7474 32.2841C80.0277 32.5947 79.183 32.75 78.2133 32.75ZM78.486 30.8978C79.5618 30.8978 80.4936 30.6591 81.2815 30.1818C82.0694 29.7046 82.6754 29.072 83.0997 28.2841C83.5315 27.4887 83.7474 26.6137 83.7474 25.6591V23.1364C83.5959 23.2803 83.3421 23.4091 82.986 23.5228C82.6375 23.6364 82.2322 23.7387 81.7701 23.8296C81.3156 23.9129 80.861 23.9849 80.4065 24.0455C79.9519 24.1061 79.5428 24.1591 79.1792 24.2046C78.1944 24.3258 77.3534 24.5152 76.6565 24.7728C75.9595 25.0303 75.4254 25.3864 75.0542 25.8409C74.683 26.2879 74.4974 26.8637 74.4974 27.5682C74.4974 28.6288 74.8762 29.4508 75.6337 30.0341C76.3913 30.6099 77.3421 30.8978 78.486 30.8978Z" fill="#ffffff"/>
<path d="M54 32.3523V9.07959H61.8523C63.3674 9.07959 64.6288 9.34474 65.6364 9.87504C66.6515 10.4053 67.4129 11.1288 67.9205 12.0455C68.428 12.9622 68.6818 14.0038 68.6818 15.1705C68.6818 16.1402 68.5189 16.9697 68.1932 17.6591C67.8674 18.3485 67.4242 18.9053 66.8636 19.3296C66.303 19.7538 65.678 20.0607 64.9886 20.25V20.4319C65.7386 20.4849 66.4659 20.75 67.1705 21.2273C67.875 21.697 68.4545 22.3561 68.9091 23.2046C69.3636 24.0531 69.5909 25.0682 69.5909 26.25C69.5909 27.4243 69.3295 28.4735 68.8068 29.3978C68.2841 30.3144 67.4811 31.0379 66.3977 31.5682C65.322 32.091 63.9508 32.3523 62.2841 32.3523H54ZM56.125 30.4432H62.2841C64.0795 30.4432 65.4053 30.0455 66.2614 29.25C67.125 28.4546 67.5568 27.4546 67.5568 26.25C67.5568 25.3637 67.3409 24.5607 66.9091 23.841C66.4848 23.1137 65.8826 22.5379 65.1023 22.1137C64.3295 21.6894 63.4205 21.4773 62.375 21.4773H56.125V30.4432ZM56.125 19.591H62.0455C62.9621 19.591 63.7652 19.4016 64.4545 19.0228C65.1439 18.644 65.6818 18.1213 66.0682 17.4546C66.4545 16.7879 66.6477 16.0266 66.6477 15.1705C66.6477 13.9357 66.2462 12.9319 65.4432 12.1591C64.6402 11.3788 63.4432 10.9887 61.8523 10.9887H56.125V19.591Z" fill="#ffffff"/>
<path d="M8.54946 22.2868C10.758 21.695 11.9088 18.8281 11.1197 15.8833C10.3307 12.9386 7.90065 11.0312 5.6921 11.6229C3.48355 12.2147 2.33281 15.0816 3.12185 18.0264C3.91089 20.9711 6.34091 22.8785 8.54946 22.2868Z" fill="#ffffff"/>
<path d="M17.48 20.24C19.2411 19.9925 20.382 17.7524 20.0285 15.2366C19.6749 12.7208 17.9607 10.882 16.1996 11.1295C14.4386 11.377 13.2976 13.6171 13.6511 16.1329C14.0047 18.6487 15.719 20.4875 17.48 20.24Z" fill="#ffffff"/>
<path d="M24.84 21.62C26.3643 21.62 27.6 19.7665 27.6 17.48C27.6 15.1935 26.3643 13.34 24.84 13.34C23.3157 13.34 22.08 15.1935 22.08 17.48C22.08 19.7665 23.3157 21.62 24.84 21.62Z" fill="#ffffff"/>
<path d="M31.4721 24.3934C32.6042 24.5525 33.7226 23.2539 33.9701 21.4929C34.2176 19.7318 33.5004 18.1752 32.3683 18.0161C31.2362 17.857 30.1178 19.1556 29.8703 20.9167C29.6228 22.6777 30.34 24.2343 31.4721 24.3934Z" fill="#ffffff"/>
<path d="M36.5024 28.7108C37.3612 28.9409 38.3507 28.0334 38.7123 26.6837C39.0739 25.334 38.6709 24.0534 37.812 23.8232C36.9531 23.5931 35.9637 24.5006 35.602 25.8503C35.2404 27.2 35.6435 28.4807 36.5024 28.7108Z" fill="#ffffff"/>
</svg>`

/**
 * Serve a session's (or the default app's) static asset if `pathname` is one of
 * the host-owned asset routes. Returns null for non-asset paths so the caller
 * falls through to dispatching into the app.
 */
function serveAsset(
  pathname: string,
  unoCss: string,
  clientJs: Record<string, string>,
): Response | null {
  // tokens.css and barefoot.js are FIXED across sessions — served from embedded
  // constants (not the per-session store), so they never bloat a session value.
  if (pathname === TOKENS_CSS_PATH) {
    return new Response(TOKENS_CSS, {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  }
  if (pathname === `${STATIC_BASE}barefoot.js`) {
    return new Response(BAREFOOT_RUNTIME_JS, {
      headers: { 'content-type': 'text/javascript; charset=utf-8' },
    })
  }
  if (pathname === UNO_CSS_PATH) {
    return new Response(unoCss, {
      headers: { 'content-type': 'text/css; charset=utf-8' },
    })
  }
  // /__rt-static/components/<Name>.client.js → the session's own user component
  // client JS (keyed by PascalCase component name) OR a FIXED registry
  // component's combined client JS (keyed by lowercase folder name, e.g.
  // `button`). The two key spaces don't collide; a registry component's SSR
  // template emits a `<script src=".../button.client.js">` tag, so this is how
  // its hydration (`hydrate('Button', …)`) reaches the page.
  if (pathname.startsWith(STATIC_BASE) && pathname.endsWith('.client.js')) {
    const name = pathname.slice(STATIC_BASE.length, -'.client.js'.length)
    const js = clientJs[name] ?? REGISTRY_CLIENT_JS[name]
    if (js != null) {
      return new Response(js, {
        headers: { 'content-type': 'text/javascript; charset=utf-8' },
      })
    }
  }
  return null
}

const SESSION_COOKIE = 'bf_pg_session'

// Fetch a session's persisted state from its Durable Object (null if none yet).
function getSession(
  env: Env,
  sessionId: string | null,
): Promise<StoredSession | null> {
  if (!sessionId) return Promise.resolve(null)
  const ns = env.PLAYGROUND_SESSION
  return ns.get(ns.idFromName(sessionId)).getSession()
}

function readSessionId(request: Request): string | null {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  for (const part of cookie.split(';')) {
    const [k, v] = part.trim().split('=')
    if (k === SESSION_COOKIE && v) return v
  }
  return null
}

function newSessionId(): string {
  return crypto.randomUUID()
}

// The FIXED vendor + pre-compiled registry modules, shared by every session.
// Built once. Vendor shims are object-form, keyed by bare specifier. The
// registry modules are ROOT-keyed plain-string ESM (`ui_<name>.js`) so their
// own bare `hono/*` imports resolve against the vendor shims (the loader
// resolves bare specifiers relative to the importer's key-as-path, so registry
// modules must sit at the root — see build-registry.ts). The user's compiled
// app imports the registry as `./ui_<name>.js` (compile-app-core rewrites the
// `@/components/ui/<name>` specifier), resolving to these modules.
function fixedModules(): Record<string, string | { js: string }> {
  const modules: Record<string, string | { js: string }> = {
    'vendor.js': { js: VENDOR_JS },
  }
  for (const [specifier, shim] of Object.entries(VENDOR_SHIMS)) {
    modules[specifier] = { js: shim }
  }
  for (const [key, js] of Object.entries(REGISTRY_MODULES)) {
    modules[key] = js
  }
  return modules
}

// A minimal module that exports a fetch handler. No bare imports — the loaded
// isolate has no node_modules, so everything it references must live in
// `modules`. Kept to isolate the Worker Loader machinery itself.
const TRIVIAL_MODULE = /* js */ `
export default {
  async fetch(request) {
    const url = new URL(request.url)
    return new Response(
      '<!doctype html><html><head><meta charset="utf-8"><title>Dynamic Worker</title></head>' +
        '<body><h1>Hello from a Dynamic Worker</h1>' +
        '<p>path: ' + url.pathname + '</p></body></html>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } },
    )
  },
}
`

// Dispatch a request into the app for an ALREADY-FETCHED session (callers fetch
// once via getSession and pass it in, so a single request never hits the DO
// twice). If the session has no build yet, fall back to the default app
// compiled at build time (generated/rt-counter.ts), so a fresh visitor sees a
// working preview before their first Run.
//
// The loaded app contains ONLY page routes — static assets (barefoot.js,
// <Name>.client.js, uno.css, tokens.css) are served by the host (see
// serveAsset), so requests for them never reach the loaded isolate.
function loadAndDispatch(
  env: Env,
  sessionId: string | null,
  session: StoredSession | null,
  request: Request,
): Promise<Response> {
  if (!session) {
    // No build yet → the prebuilt default app (same module shape as a session,
    // just compiled offline). Keyed distinctly so it never collides with a real
    // session's isolate.
    const app = env.LOADER.get('rt-counter-default', async () => ({
      compatibilityDate: '2025-05-01',
      mainModule: RT_COUNTER_MAIN,
      modules: RT_COUNTER_MODULES,
      globalOutbound: null,
    }))
    return app.getEntrypoint().fetch(request)
  }

  // The cache key embeds the build generation so each Run loads fresh code.
  const cacheKey = `${sessionId}@${session.generation}`
  const app = env.LOADER.get(cacheKey, async () => ({
    compatibilityDate: '2025-05-01',
    mainModule: session.mainModule,
    modules: { ...session.userModules, ...fixedModules() },
    globalOutbound: null,
  }))
  return app.getEntrypoint().fetch(request)
}

const app = new Hono<{ Bindings: Env }>()

// Health/diagnostic endpoint served by the host worker itself.
app.get('/__host_health', (c) =>
  c.json({ ok: true, hasLoader: typeof c.env.LOADER?.get === 'function' }),
)

// Spike path: trivial module, kept to isolate the Loader machinery.
app.all('/__spike', (c) => {
  const spike = c.env.LOADER.get('spike-trivial', async () => ({
    compatibilityDate: '2025-05-01',
    mainModule: 'index.js',
    modules: { 'index.js': TRIVIAL_MODULE },
    globalOutbound: null,
  }))
  return spike.getEntrypoint().fetch(c.req.raw)
})

// Playground UI shell. Issues a session cookie so the very first preview /
// build share one opaque session id.
//
// `/` is overloaded: the top-level document is the playground UI, but the
// PREVIEW APP's own home is also `/`. A request for `/` originating from inside
// the preview iframe — e.g. the app's `<a href="/">` Home link, or the URL bar
// navigating Home — must render the APP's home, NOT the UI, otherwise the whole
// playground nests inside its own preview. The browser tags iframe-context
// document loads with `Sec-Fetch-Dest: iframe`, which distinguishes them from
// the top-level page load.
app.get('/', async (c) => {
  if (c.req.header('Sec-Fetch-Dest') === 'iframe') {
    const sid = readSessionId(c.req.raw)
    return loadAndDispatch(c.env, sid, await getSession(c.env, sid), c.req.raw)
  }
  if (!readSessionId(c.req.raw)) {
    setCookie(c, SESSION_COOKIE, newSessionId(), { path: '/', sameSite: 'Lax' })
  }
  return c.html(UI_SHELL_HTML)
})

// Explorer feed: the app's embedded source files.
app.get('/_pg/files', (c) => c.json({ files: APP_FILES }))

// Monaco TypeScript .d.ts bundle.
app.get('/_pg/types-bundle.json', (c) => c.json(TYPES_BUNDLE))

// UI client script.
app.get('/_pg/app.js', (c) =>
  c.body(UI_CLIENT_JS, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
)

// The Barefoot.js wordmark shown in the header (matches barefootjs.dev/playground).
app.get('/_pg/logo.svg', (c) =>
  c.body(LOGO_SVG, 200, {
    'content-type': 'image/svg+xml; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  }),
)

// Browser compile worker (compileAppCore + @barefootjs/jsx + UnoCSS +
// esbuild-wasm). Spawned by the UI as a module web worker.
app.get('/_pg/compile-worker.js', (c) =>
  c.body(COMPILE_WORKER_JS, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
)

// The fixed barefoot.js DOM runtime, fetched by the compile worker to bake the
// inline _assets.js module.
app.get('/_pg/barefoot-runtime.js', (c) =>
  c.body(BAREFOOT_RUNTIME_JS, 200, { 'content-type': 'text/javascript; charset=utf-8' }),
)

// AI chat: stream an agent reply (Workers AI, or MOCK mode locally) as SSE. The
// browser parses fenced file-edit blocks from the reply and runs the existing
// compile→/_pg/build→reload-preview loop.
app.post('/_pg/chat', (c) => handleChat(c.req.raw, c.env.AI))

// Stash a session's compiled user modules (posted by the UI after a Run).
app.post('/_pg/build', async (c) => {
  let sessionId = readSessionId(c.req.raw)
  const issueCookie = !sessionId
  if (!sessionId) sessionId = newSessionId()

  let body: {
    userModules?: Record<string, string>
    mainModule?: string
    assets?: RtAppAssets
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ ok: false, error: 'Invalid JSON body' }, 400)
  }
  if (!body.userModules || !body.mainModule || !body.assets) {
    return c.json({ ok: false, error: 'Missing userModules/mainModule/assets' }, 400)
  }

  // Persist in the session's DO. barefoot.js is dropped (served from the fixed
  // embedded constant), keeping the stored value small.
  const ns = c.env.PLAYGROUND_SESSION
  await ns.get(ns.idFromName(sessionId)).putBuild({
    mainModule: body.mainModule,
    userModules: body.userModules,
    unoCss: body.assets.unoCss,
    clientJs: body.assets.clientJs,
  })

  if (issueCookie) {
    setCookie(c, SESSION_COOKIE, sessionId, { path: '/', sameSite: 'Lax' })
  }
  return c.json({ ok: true })
})

// Everything else: host-owned static assets, the preview iframe entry, and the
// live app's own page routes. Order matters — assets are checked before any app
// dispatch.
app.all('*', async (c) => {
  const url = new URL(c.req.url)
  const sessionId = readSessionId(c.req.raw)
  // Fetch the session once; reuse it for both asset serving and dispatch.
  const session = await getSession(c.env, sessionId)
  const unoCss = session ? session.unoCss : RT_COUNTER_ASSETS.unoCss
  const clientJs = session ? session.clientJs : RT_COUNTER_ASSETS.clientJs

  // Host-owned static assets (barefoot.js + tokens.css are fixed constants;
  // uno.css + per-component client.js come from the session). The AI's
  // server.tsx only contains page routes.
  const asset = serveAsset(url.pathname, unoCss, clientJs)
  if (asset) return asset

  // Preview iframe entry document. Rewrite to the app's root and dispatch into
  // the session app (or the default app if no build yet). The mini-browser URL
  // bar navigates the iframe to arbitrary app paths (e.g. /counter), which hit
  // the unchanged dispatch below.
  if (url.pathname === '/_preview' || url.pathname === '/_preview/') {
    const rewritten = new URL(c.req.url)
    rewritten.pathname = '/'
    return loadAndDispatch(c.env, sessionId, session, new Request(rewritten, c.req.raw))
  }

  // HTML page routes (/, /counter, /todo … typed in the URL bar): dispatch
  // UNCHANGED into the session app.
  return loadAndDispatch(c.env, sessionId, session, c.req.raw)
})

export default app
