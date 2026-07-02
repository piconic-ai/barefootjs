# frozen_string_literal: true

# BarefootJS + Sinatra example — a Ruby/Rack port of integrations/xslate's
# app.psgi, running the SAME shared JSX components (../shared/components,
# ../shared/blog) through the @barefootjs/erb compiler + Ruby runtime
# instead of Text::Xslate.
#
# `lib` is populated by scripts/assemble-deps.ts at build time (used in the
# container); the workspace source dir is listed too so local dev resolves
# without the assemble step. Either location works.
$LOAD_PATH.unshift(File.expand_path('lib', __dir__))
$LOAD_PATH.unshift(File.expand_path('../../packages/adapter-erb/lib', __dir__))

require 'sinatra/base'
require 'json'
require 'securerandom'

require 'barefoot_js'
require 'barefoot_js/backend/erb'
require 'barefoot_js/dev_reload'

# URL prefix the app is mounted under. Defaults to /integrations/sinatra so
# the app is deploy-ready for barefootjs.dev/integrations/sinatra. A plain
# constant (not a Sinatra `set`) because config.ru's Rack::Builder needs it
# too, to mount static assets + this app at the same prefix.
BASE = ENV.fetch('BASE_PATH', '/integrations/sinatra')
DEV = ENV.fetch('RACK_ENV', 'development') != 'production'

# One ERB backend renders every component from dist/templates. In dev the
# template cache is disabled (see BarefootJS::Backend::Erb's `cache:` option)
# so edits picked up by `bun run build:watch` render on the next request
# without a server restart.
BACKEND = BarefootJS::Backend::Erb.new(
  path: 'dist/templates',
  json_encoder: ->(data) { JSON.generate(data) },
  cache: !DEV,
)

# ---------------------------------------------------------------------------
# Per-session in-memory todo storage (mirrors the Perl examples): each
# browser gets an opaque id via a BASE-scoped cookie; SESSIONS keys on it so
# one visitor's list is never visible to another. LRU-bounded.
#
# Puma runs multi-threaded by default (unlike Perl Starman's one-process-per-
# worker model), so — unlike app.psgi — access to the shared session store is
# guarded by a Mutex.
# ---------------------------------------------------------------------------
SESSION_COOKIE = 'bf_session'
SESSION_TTL_SEC = 60 * 60 * 24 * 30
SESSION_STORE_MAX = 1000

SESSIONS = {}
SESSION_ORDER = []
SESSIONS_MUTEX = Mutex.new

def seed_todos
  [
    { id: 1, text: 'Setup project', done: false, editing: false },
    { id: 2, text: 'Create components', done: false, editing: false },
    { id: 3, text: 'Write tests', done: true, editing: false },
  ]
end

# AI Chat dummy responses (streamed char-by-char over SSE).
AI_RESPONSES = [
  '[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.',
  '[Dummy response] BarefootJS compiles JSX to ERB templates + client JS. Signals drive reactivity on any backend.',
  '[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.',
  '[Dummy response] The ERB backend runs under any Rack server — here Puma streams each character with a 30ms delay.',
  '[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.',
].freeze

# ---------------------------------------------------------------------------
# Blog — the @barefootjs/router showcase (ERB / Sinatra)
#
# Mirrors integrations/xslate/app.psgi's blog routes (itself mirroring
# integrations/hono/blog.tsx): a region-shell layout (header + ThemeToggle in
# the shell, a hand-authored sidebar region `nav:0` + the compiled
# <PageShell> nested content regions in the main column) whose islands are
# the shared blog components in ../shared/blog, compiled by this
# integration's `bf build`. The client router (client/router-entry.ts,
# bundled to client/router-entry.js) swaps only the content region.
#
# There is no server JSX here: the page is composed in Ruby from
# individually-rendered island templates (`blog_island`), each sharing one
# request-scoped script collector (`root`) so the page emits the union of
# <script> tags once.
#
# searchParams() SSR (router v0.5): PostList's derived `params` / `visible`
# memos and the per-link sort/tag getters are not statically lowerable to a
# template-string adapter (their ssrDefaults are null — the same limitation
# the Go adapter has). We seed `params` from the request query and `visible`
# with the full list, so the server renders all posts; the client
# re-derives the sorted/filtered list + active controls from
# `searchParams()` on hydration.
# ---------------------------------------------------------------------------

def slurp_json(path)
  return nil unless File.file?(path)

  JSON.parse(File.read(path, encoding: 'UTF-8'), symbolize_names: true)
rescue JSON::ParserError
  nil
end

BLOG_MANIFEST = slurp_json('dist/templates/manifest.json') || {}
BLOG_DATA = slurp_json('dist/blog-data.json') || { posts: [], listItems: [], allTags: [] }

# NOTE on naming: `bf build`'s ERB output files are always named after the
# PascalCase component/source-file name (e.g. `TodoItem.tsx` ->
# `templates/TodoItem.erb`) — `BACKEND.render_named` below always takes that
# PascalCase name directly, never snake_cased. The @barefootjs/erb adapter's
# own internal `toTemplateName` snake_case conversion is a SEPARATE thing: it
# only picks the literal registry-key string baked into a compiled parent
# template's `bf.render_child('todo_item', ...)` call. That key is an
# adapter-chosen slot identifier, not a file name — resolving it to an actual
# template is this integration's job, exactly like the Perl/Xslate examples'
# `children => { todo_item => 'TodoItem' }` two-part mapping below.

def rand_suffix
  rand.to_s[2, 6]
end

# Register a renderer for a flat (non-`ui/*`) child component from the build
# manifest (`post_list_item` -> PostListItem, `reader_toolbar` ->
# ReaderToolbar): a fresh child scope chained off the caller's slot, the
# shared script collector + renderer registry, and the manifest's
# ssrDefaults seeded (caller prop wins).
def register_blog_child(parent_bf, slot, component, extra_seed = {})
  entry = BLOG_MANIFEST[component.to_sym]
  return unless entry

  defaults = entry[:ssrDefaults]
  parent_bf.register_child_renderer(slot, lambda do |props, caller|
    host = caller || parent_bf
    host_scope = host._scope_id
    child = BarefootJS::Context.new(BACKEND)
    slot_id = props.delete(:_bf_slot)
    data_key = props.delete(:key)
    child._data_key(data_key) unless data_key.nil?
    child._scope_id(slot_id ? "#{host_scope}_#{slot_id}" : "#{component}_#{rand_suffix}")
    child._is_child(true)
    if slot_id
      child._bf_parent(host_scope)
      child._bf_mount(slot_id)
    end
    child._child_renderers(parent_bf._child_renderers)
    child._scripts(parent_bf._scripts)
    child._script_seen(parent_bf._script_seen)
    extra = defaults ? BarefootJS::Context.derive_vars_from_defaults(defaults, props) : {}
    # Per-child SSR seeds the static extractor can't supply (e.g.
    # NowPlaying's `Math` -> `{ min: 0 }` for the progress-bar width).
    rendered = BACKEND.render_named(component, child, extra.merge(extra_seed).merge(props))
    rendered.chomp
  end)
end

# Render one top-level island to an HTML string, sharing `root`'s script
# collector + renderer registry so islands compose into one page.
#   props    - props (-> bf-p, so the client hydration sees them, AND template vars)
#   extra    - SSR-only template vars (derived memo / getter values not lowered)
#   children - slot key -> child template to register for nested render_child
#              (a value may be `'Template'` or `['Template', extra_seed]`)
def blog_island(root, component, props = {}, extra = {}, children = {})
  bf = BarefootJS::Context.new(BACKEND)
  bf._scope_id("#{component}_#{rand_suffix}")
  bf._props(props) unless props.empty?
  bf._scripts(root._scripts)
  bf._script_seen(root._script_seen)
  bf._child_renderers(root._child_renderers)
  children.each do |slot, spec|
    tpl, seed = spec.is_a?(Array) ? spec : [spec, {}]
    register_blog_child(bf, slot, tpl, seed)
  end
  entry = BLOG_MANIFEST[component.to_sym]
  defaults = entry && entry[:ssrDefaults]
  seed = defaults ? BarefootJS::Context.derive_vars_from_defaults(defaults, props) : {}
  BACKEND.render_named(component, bf, seed.merge(props).merge(extra))
end

# Assemble the region-shell page around already-rendered content HTML. `root`
# is the request-scoped runtime whose script collector the content islands
# (and the shell islands rendered here) all share.
def blog_page(root, title, base, content_html)
  static = "#{BASE}/client"
  theme = blog_island(root, 'ThemeToggle')
  sidebar = blog_island(root, 'Sidebar')
  shell = blog_island(root, 'PageShell',
                       {}, # no client props
                       { children: BACKEND.mark_raw(content_html) }, # SSR-only: page content
                       { 'reader_toolbar' => 'ReaderToolbar' })
  importmap = JSON.generate({ imports: {
    '@barefootjs/client' => "#{static}/barefoot.js",
    '@barefootjs/client/runtime' => "#{static}/barefoot.js",
    '@barefootjs/client/reactive' => "#{static}/barefoot.js",
  } })
  scripts = root.scripts
  esc_title = root.h(title)
  <<~HTML
    <!DOCTYPE html>
    <html lang="en" data-theme="dark">
    <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>#{esc_title}</title>
    <script type="importmap">#{importmap}</script>
    <link rel="stylesheet" href="#{BASE}/styles/blog.css">
    </head>
    <body>
    <header class="shell">
    <a class="shell-brand" href="#{base}">\u{1F4F0} Barefoot Blog</a>
    <div class="shell-island">#{theme}</div>
    </header>
    <div class="layout">
    <aside bf-region="nav:0">#{sidebar}</aside>
    <main>#{shell}</main>
    </div>
    #{scripts}
    <script type="module" src="#{static}/router-entry.js"></script>
    </body>
    </html>
  HTML
end

class SinatraApp < Sinatra::Base
  set :root, __dir__
  set :views, nil
  set :sessions, false
  set :show_exceptions, DEV
  set :dump_errors, DEV
  set :raise_errors, false

  # ---------------------------------------------------------------------
  # Rendering: build a per-request runtime, register child renderers, render
  # the component template, and wrap the result in the page layout.
  # ---------------------------------------------------------------------
  def render_component(component, heading: '', title: nil, props: nil, children: {}, signal_init: {}, stash: {}, extra_css: '', back: nil)
    bf = BarefootJS::Context.new(BACKEND)
    scope_id = "#{component}_#{rand_suffix}"
    bf._scope_id(scope_id)
    bf._props(props) if props && !props.empty?

    children.each do |slot, child_template|
      child_init = signal_init[slot]
      bf.register_child_renderer(slot, lambda do |child_props, _caller|
        child_bf = BarefootJS::Context.new(BACKEND)
        slot_id = child_props.delete(:_bf_slot)
        # Loop children carry no _bf_slot; fall back to template + suffix so
        # each instance gets a distinct scope id (client JS finds children by
        # scope). Slot children pin to <parent>_<slot>.
        child_bf._scope_id(slot_id ? "#{scope_id}_#{slot_id}" : "#{child_template}_#{rand_suffix}")
        child_bf._is_child(true)
        # Share the parent's script collector so a child's register_script
        # de-dupes against the page's existing <script> set.
        child_bf._scripts(bf._scripts)
        child_bf._script_seen(bf._script_seen)
        extra = child_init ? child_init.call(child_props) : {}
        BACKEND.render_named(child_template, child_bf, child_props.merge(extra))
      end)
    end

    body = BACKEND.render_named(component, bf, stash)
    layout(
      title: title || "#{component} - BarefootJS",
      heading: heading,
      body: body,
      scripts: bf.scripts,
      extra_css: extra_css,
      back: back,
    )
  end

  def layout(title:, heading:, body:, scripts:, extra_css: '', back: nil)
    heading_html = heading && !heading.empty? ? "<h1>#{heading}</h1>" : ''
    # Subpages link back to the example list (BASE/); the list page itself
    # passes back: '' to suppress the link (the header breadcrumb already
    # navigates up to /integrations).
    back_href = back || "#{BASE}/"
    back_html = back_href.empty? ? '' : %(<p><a href="#{back_href}">&larr; Back</a></p>)
    dev_snippet = DEV ? BarefootJS::DevReload.snippet("#{BASE}/_bf/reload") : ''
    <<~HTML
      <!DOCTYPE html>
      <html lang="en" class="dark">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>#{title}</title>
          <link rel="stylesheet" href="#{BASE}/styles/tokens.css">
          <link rel="stylesheet" href="#{BASE}/styles/layout.css">
          <link rel="stylesheet" href="#{BASE}/styles/components.css">
          <link rel="stylesheet" href="#{BASE}/styles/todo-app.css">
          #{extra_css}
      </head>
      <body>
          <header class="bf-header">
              <div class="bf-header-inner">
                  <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="Barefoot.js">
                      <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
                  </a>
                  <div class="bf-header-sep"></div>
                  <nav class="bf-header-crumbs" aria-label="Breadcrumb">
                      <a href="/integrations" class="bf-header-link">Integrations</a>
                      <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
                      <span class="bf-header-current" aria-current="page">Sinatra</span>
                  </nav>
              </div>
          </header>
          #{heading_html}
          <div id="app">#{body}</div>
          #{back_html}
          #{scripts}
          #{dev_snippet}
      </body>
      </html>
    HTML
  end

  # -----------------------------------------------------------------------
  # Session helpers
  # -----------------------------------------------------------------------
  def get_session
    id = request.cookies[SESSION_COOKIE]
    if id.nil? || id.empty?
      id = SecureRandom.hex(16)
      response.set_cookie(SESSION_COOKIE, value: id, path: BASE, http_only: true, same_site: :lax, max_age: SESSION_TTL_SEC)
    end

    SESSIONS_MUTEX.synchronize do
      unless SESSIONS.key?(id)
        SESSIONS[id] = { todos: seed_todos, next_id: 4 }
        SESSION_ORDER.push(id)
        while SESSION_ORDER.length > SESSION_STORE_MAX
          SESSIONS.delete(SESSION_ORDER.shift)
        end
      end
      SESSION_ORDER.delete(id)
      SESSION_ORDER.push(id)
      SESSIONS[id]
    end
  end

  # -----------------------------------------------------------------------
  # Routes — PATH_INFO here is already stripped of BASE by config.ru's
  # Rack::Builder `map`.
  # -----------------------------------------------------------------------

  get '/' do
    layout(title: 'BarefootJS + Sinatra Example', heading: 'BarefootJS + Sinatra Example', back: '', scripts: '', body: <<~HTML)
      <p>This example renders the same shared JSX components with Sinatra (ERB)
      under a plain Rack app — Sinatra's routing DSL is the only framework
      dependency; rendering goes straight through @barefootjs/erb.</p>
      <ul>
          <li><a href="#{BASE}/counter">Counter</a></li>
          <li><a href="#{BASE}/toggle">Toggle</a></li>
          <li><a href="#{BASE}/todos">Todo (@client)</a></li>
          <li><a href="#{BASE}/todos-ssr">Todo (no @client markers)</a></li>
          <li><a href="#{BASE}/ai-chat">AI Chat (SSE Streaming)</a></li>
          <li><a href="#{BASE}/blog">Blog (@barefootjs/router - partial navigation)</a></li>
      </ul>
    HTML
  end

  get '/counter' do
    render_component('Counter', heading: 'Counter Component')
  end

  get '/toggle' do
    items = [
      { label: 'Setting 1', defaultOn: true },
      { label: 'Setting 2', defaultOn: false },
      { label: 'Setting 3', defaultOn: false },
    ]
    render_component('Toggle',
                      heading: 'Toggle Component',
                      children: { 'toggle_item' => 'ToggleItem' },
                      signal_init: { 'toggle_item' => ->(p) { { on: !!p[:defaultOn] } } },
                      props: { toggleItems: items },
                      stash: { toggleItems: items })
  end

  get '/form' do
    render_component('Form', heading: 'Form Example', props: {}, stash: { accepted: false })
  end

  get '/reactive-props' do
    render_component('ReactiveProps',
                      heading: 'Reactive Props Test',
                      children: { 'reactive_child' => 'ReactiveChild' },
                      props: {}, stash: { count: 0, doubled: 0 })
  end

  get %r{/conditional-return(-link)?} do
    variant = params[:captures]&.first == '-link' ? 'link' : ''
    render_component('ConditionalReturn',
                      heading: "Conditional Return Example#{variant.empty? ? '' : ' (Link)'}",
                      props: { variant: variant },
                      stash: { variant: variant, count: 0 })
  end

  get '/props-reactivity' do
    mk = ->(p) { { displayValue: (p[:value] || 0) * 10 } }
    render_component('PropsReactivityComparison',
                      heading: 'Props Reactivity Comparison',
                      children: { 'props_style_child' => 'PropsStyleChild', 'destructured_style_child' => 'DestructuredStyleChild' },
                      signal_init: { 'props_style_child' => mk, 'destructured_style_child' => mk },
                      props: {}, stash: { count: 1 })
  end

  get '/portal' do
    render_component('PortalExample', heading: 'Portal Example', props: {}, stash: { open: false })
  end

  get '/ai-chat' do
    render_component('AIChatInteractive',
                      title: 'AI Chat — SSE Streaming (Sinatra)',
                      heading: 'AI Chat — SSE Streaming',
                      stash: { messages: [], input: '', streamingText: '', isStreaming: false },
                      extra_css: %(<link rel="stylesheet" href="#{BASE}/styles/ai-chat.css">))
  end

  get %r{/todos(-ssr)?} do
    session = get_session
    todos = session[:todos].map(&:dup)
    done = todos.count { |t| t[:done] }
    component = params[:captures]&.first == '-ssr' ? 'TodoAppSSR' : 'TodoApp'
    render_component(component,
                      children: { 'todo_item' => 'TodoItem' },
                      props: { initialTodos: todos },
                      stash: { todos: todos, newText: '', filter: 'all', doneCount: done })
  end

  # --- todo REST API ---
  get '/api/todos' do
    content_type :json
    JSON.generate(get_session[:todos])
  end

  post '/api/todos' do
    session = get_session
    input = parse_json_body
    todo = nil
    # id assignment + increment must be atomic together (Puma is threaded,
    # unlike Perl Starman's one-process-per-worker model) or two concurrent
    # POSTs could read the same next_id before either increments it.
    SESSIONS_MUTEX.synchronize do
      todo = { id: session[:next_id], text: input[:text], done: false, editing: false }
      session[:todos].push(todo)
      session[:next_id] += 1
    end
    content_type :json
    status 201
    JSON.generate(todo)
  end

  put '/api/todos/:id' do
    session = get_session
    input = parse_json_body
    id = params[:id].to_i
    todo = SESSIONS_MUTEX.synchronize do
      t = session[:todos].find { |x| x[:id] == id }
      next nil unless t

      t[:text] = input[:text] if input.key?(:text)
      t[:done] = !!input[:done] if input.key?(:done)
      t
    end
    halt 404, { 'content-type' => 'application/json' }, JSON.generate({ error: 'not found' }) unless todo

    content_type :json
    JSON.generate(todo)
  end

  delete '/api/todos/:id' do
    session = get_session
    id = params[:id].to_i
    SESSIONS_MUTEX.synchronize { session[:todos].reject! { |t| t[:id] == id } }
    status 204
    ''
  end

  post '/api/todos/reset' do
    session = get_session
    SESSIONS_MUTEX.synchronize do
      session[:todos] = seed_todos
      session[:next_id] = 4
    end
    content_type 'text/plain'
    'ok'
  end

  # Char-by-char SSE stream. Sinatra's `stream` helper hands us a writable
  # object backed by the same Enumerator-body streaming BarefootJS::DevReload
  # uses; Puma (threaded) flushes each chunk as it's written, so the 30ms
  # per-character delay is visible to the client incrementally, same as the
  # Perl example's Starman-based streaming responder.
  get '/api/ai-chat' do
    content_type 'text/event-stream'
    headers 'cache-control' => 'no-cache'
    text = AI_RESPONSES.sample
    stream do |out|
      text.each_char do |ch|
        out << "data: #{JSON.generate(ch)}\n\n"
        sleep 0.03
      end
      out << "data: [DONE]\n\n"
    end
  end

  # --- blog routes ---
  get '/blog' do
    root = BarefootJS::Context.new(BACKEND)
    base = "#{BASE}/blog"
    sort = params[:sort] || 'date'
    tag = params[:tag] || ''
    items = BLOG_DATA[:listItems]
    post_list = blog_island(root, 'PostList',
                             # Client props (-> bf-p): `visible()` re-derives from these on
                             # every `searchParams()` change, so they must reach the client.
                             { items: items, tags: BLOG_DATA[:allTags], base: base },
                             {
                               # SSR-only derived values. `params` from the request query
                               # (correct server-side labels); `visible` falls back to the
                               # full list. The per-link sort/tag class+href getters
                               # collapse to one SSR scalar each (the compiler can't tell
                               # `sortClass('date')` from `sortClass('title')` statically),
                               # so seed neutral defaults — the client sets the correct
                               # active highlight + hrefs from searchParams.
                               params: { sort: sort, tag: tag },
                               visible: items,
                               sortClass: 'sort',
                               sortHref: base,
                               tagClass: 'tag',
                               tagHref: base,
                             },
                             { 'post_list_item' => 'PostListItem' })
    now = blog_island(root, 'NowPlaying', {}, { Math: { min: 0 } })
    title = tag.empty? ? 'Barefoot Blog — Latest posts' : "##{tag} — Barefoot Blog"
    blog_page(root, title, base, post_list + now)
  end

  get '/blog/posts/:slug' do
    # Sort newest-first (the index's default display order) so the article
    # pager walks down the list the reader is browsing; the corpus is
    # authored oldest-first.
    posts = BLOG_DATA[:posts].sort_by { |p| p[:date] }.reverse
    i = posts.index { |p| p[:slug] == params[:slug] }
    halt 404, 'Not Found' unless i

    p = posts[i]
    prev_post = i.positive? ? posts[i - 1] : nil
    next_post = i < posts.length - 1 ? posts[i + 1] : nil
    base = "#{BASE}/blog"
    root = BarefootJS::Context.new(BACKEND)
    # The whole article is the shared <PostArticle> island; the interactive
    # widgets are its nested children (NowPlaying needs Math seeded).
    content = blog_island(root, 'PostArticle',
                           {
                             slug: p[:slug], title: p[:title], date: p[:date],
                             tags: p[:tags], body: p[:body],
                             position: i + 1, total: posts.length, base: base,
                             prevSlug: prev_post && prev_post[:slug],
                             prevTitle: prev_post && prev_post[:title],
                             nextSlug: next_post && next_post[:slug],
                             nextTitle: next_post && next_post[:title],
                           },
                           {},
                           {
                             'like_button' => 'LikeButton',
                             'reading_timer' => 'ReadingTimer',
                             'now_playing' => ['NowPlaying', { Math: { min: 0 } }],
                           })
    blog_page(root, "#{p[:title]} — Barefoot Blog", base, content)
  end

  # Sinatra invokes the registered `not_found` handler for ANY 404 response —
  # including one an API route already built via `halt 404, {...}, json` —
  # and its return value REPLACES the body Sinatra's `call!` already set
  # (see base.rb's unconditional `invoke { error_block!(response.status) }`
  # after `dispatch!`). So this has to be content-type aware: leave a JSON
  # 404 (the todo-update "not found" case) alone, and only supply the plain-
  # text page fallback when nothing set a content-type yet.
  not_found do
    next if response['content-type']&.include?('application/json')

    content_type 'text/plain'
    'Not Found'
  end

  private

  def parse_json_body
    JSON.parse(request.body.read, symbolize_names: true)
  rescue JSON::ParserError
    {}
  end
end
