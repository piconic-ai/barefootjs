# frozen_string_literal: true

# BarefootJS runtime wiring for the Rails example — the Ruby half of the
# integration. This is the direct port of the Sinatra example's app.rb
# top-level setup (constants + the pure, request-independent render helpers);
# the request-facing seams (render_component, layout, session cookie) live in
# app/controllers/concerns/barefoot_helper.rb, included into every controller.
#
# `lib` is populated by scripts/assemble-deps.ts at build time (used in the
# container); the workspace source dir is listed too so local dev resolves
# without the assemble step. Either location works. The runtime uses
# non-Zeitwerk file names (barefoot_js.rb -> BarefootJS), so it is required
# explicitly here rather than autoloaded.
%w[lib ../../packages/adapter-erb/lib].each do |rel|
  path = File.expand_path(rel, Rails.root)
  $LOAD_PATH.unshift(path) if File.directory?(path) && !$LOAD_PATH.include?(path)
end

require 'json'
require 'securerandom'

require 'barefoot_js'
require 'barefoot_js/backend/erb'
require 'barefoot_js/dev_reload'

# Namespaced so nothing leaks into the global Object space (unlike the Sinatra
# port's bare top-level constants). config.ru and the BarefootHelper concern
# both reach in through this module.
module Barefoot
  # URL prefix the app is mounted under. Defaults to /integrations/rails so the
  # app is deploy-ready for barefootjs.dev/integrations/rails. config.ru's
  # Rack::Builder mounts the static assets + this app at the same prefix.
  BASE = ENV.fetch('BASE_PATH', '/integrations/rails')
  DEV = !Rails.env.production?

  # One ERB backend renders every component from dist/templates. In dev the
  # template cache is disabled so edits picked up by `bun run build:watch`
  # render on the next request without a server restart.
  BACKEND = BarefootJS::Backend::Erb.new(
    path: Rails.root.join('dist/templates').to_s,
    json_encoder: ->(data) { JSON.generate(data) },
    cache: !DEV,
  )

  # -------------------------------------------------------------------------
  # Per-session in-memory todo storage (mirrors the Sinatra example): each
  # browser gets an opaque id via a BASE-scoped cookie; SESSIONS keys on it so
  # one visitor's list is never visible to another. LRU-bounded.
  #
  # Puma runs multi-threaded by default, so access to the shared session store
  # is guarded by a Mutex.
  # -------------------------------------------------------------------------
  SESSION_COOKIE = 'bf_session'
  SESSION_TTL_SEC = 60 * 60 * 24 * 30
  SESSION_STORE_MAX = 1000

  SESSIONS = {}
  SESSION_ORDER = []
  SESSIONS_MUTEX = Mutex.new

  # AI Chat dummy responses (streamed char-by-char over SSE).
  AI_RESPONSES = [
    '[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.',
    '[Dummy response] BarefootJS compiles JSX to ERB templates + client JS. Signals drive reactivity on any backend.',
    '[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.',
    '[Dummy response] The ERB backend runs under any Rack server — here Puma streams each character with a 30ms delay.',
    '[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.',
  ].freeze

  module_function

  def seed_todos
    [
      { id: 1, text: 'Setup project', done: false, editing: false },
      { id: 2, text: 'Create components', done: false, editing: false },
      { id: 3, text: 'Write tests', done: true, editing: false },
    ]
  end

  def rand_suffix
    rand.to_s[2, 6]
  end

  def slurp_json(path)
    return nil unless File.file?(path)

    JSON.parse(File.read(path, encoding: 'UTF-8'), symbolize_names: true)
  rescue JSON::ParserError
    nil
  end

  # -------------------------------------------------------------------------
  # Blog — the @barefootjs/router showcase (ERB / Rails)
  #
  # Mirrors the Sinatra example's blog routes: a region-shell layout (header +
  # ThemeToggle in the shell, a hand-authored sidebar region `nav:0` + the
  # compiled <PageShell> nested content regions in the main column) whose
  # islands are the shared blog components in ../shared/blog. The client router
  # (client/router-entry.ts) swaps only the content region.
  #
  # There is no server JSX here: the page is composed in Ruby from
  # individually-rendered island templates (`blog_island`), each sharing one
  # request-scoped script collector (`root`) so the page emits the union of
  # <script> tags once.
  # -------------------------------------------------------------------------

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
      rendered = BACKEND.render_named(component, child, extra.merge(extra_seed).merge(props))
      rendered.chomp
    end)
  end

  # Render one top-level island to an HTML string, sharing `root`'s script
  # collector + renderer registry so islands compose into one page.
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

  BLOG_MANIFEST = slurp_json(Rails.root.join('dist/templates/manifest.json').to_s) || {}
  BLOG_DATA = slurp_json(Rails.root.join('dist/blog-data.json').to_s) || { posts: [], listItems: [], allTags: [] }
end
