# frozen_string_literal: true

# The Rails-idiomatic seam for turning a BarefootJS component into a full HTML
# page. Included into ApplicationController, it wraps:
#   * per-request Context creation + child-renderer registration
#   * the shared page/layout string builder (see the ActionView note below)
#   * the session-cookie todo store access
#
# These are the request-facing counterparts of the pure, request-independent
# helpers in config/initializers/barefoot.rb (blog_island / blog_page); the
# split mirrors the Sinatra example (top-level funcs vs app instance methods).
#
# --- ActionView vs. a shared layout-string helper ---------------------------
# We deliberately do NOT use ActionView templates for the page shell. Every
# page's interactive markup is already a fully-rendered HTML string produced by
# BarefootJS::Backend::Erb#render_named; the only remaining job is to wrap it in
# a <!DOCTYPE html> document. Running that pre-rendered, hydration-critical
# markup back through an ActionView `.html.erb` layout would buy nothing (there
# is no per-page view logic to express) while adding a real hazard: ActionView
# would try to HTML-escape the raw island HTML unless every interpolation is
# marked `html_safe`, and the `bf-*` hydration attributes / inline scripts must
# survive byte-for-byte. A plain Ruby heredoc is the simplest thing that is
# guaranteed correct, and it keeps this example structurally parallel to the
# Sinatra one so the diff between the two Ruby integrations is "framework glue
# only". The controllers render the assembled string with `render html:` +
# `layout: false`.
module BarefootHelper
  include ExampleApp

  # Build a per-request runtime, register child renderers, render the component
  # template, and wrap the result in the page layout.
  def render_component(component, heading: '', title: nil, props: nil, children: {}, signal_init: {}, stash: {}, extra_css: '', back: nil)
    bf = BarefootJS::Context.new(ExampleApp::BACKEND)
    scope_id = "#{component}_#{ExampleApp.rand_suffix}"
    bf._scope_id(scope_id)
    bf._props(props) if props && !props.empty?

    children.each do |slot, child_template|
      child_init = signal_init[slot]
      bf.register_child_renderer(slot, lambda do |child_props, _caller|
        child_bf = BarefootJS::Context.new(ExampleApp::BACKEND)
        slot_id = child_props.delete(:_bf_slot)
        # Loop children carry no _bf_slot; fall back to template + suffix so
        # each instance gets a distinct scope id (client JS finds children by
        # scope). Slot children pin to <parent>_<slot>.
        child_bf._scope_id(slot_id ? "#{scope_id}_#{slot_id}" : "#{child_template}_#{ExampleApp.rand_suffix}")
        child_bf._is_child(true)
        # Share the parent's script collector so a child's register_script
        # de-dupes against the page's existing <script> set.
        child_bf._scripts(bf._scripts)
        child_bf._script_seen(bf._script_seen)
        extra = child_init ? child_init.call(child_props) : {}
        ExampleApp::BACKEND.render_named(child_template, child_bf, child_props.merge(extra))
      end)
    end

    body = ExampleApp::BACKEND.render_named(component, bf, stash)
    document = layout(
      title: title || "#{component} - BarefootJS",
      heading: heading,
      body: body,
      scripts: bf.scripts,
      extra_css: extra_css,
      back: back,
    )
    render html: document.html_safe, layout: false
  end

  def layout(title:, heading:, body:, scripts:, extra_css: '', back: nil)
    base = ExampleApp::BASE
    heading_html = heading && !heading.empty? ? "<h1>#{heading}</h1>" : ''
    # Subpages link back to the example list (BASE/); the list page itself
    # passes back: '' to suppress the link (the header breadcrumb already
    # navigates up to /integrations).
    back_href = back || "#{base}/"
    back_html = back_href.empty? ? '' : %(<p><a href="#{back_href}">&larr; Back</a></p>)
    dev_snippet = ExampleApp::DEV ? BarefootJS::DevReload.snippet("#{base}/_bf/reload") : ''
    <<~HTML
      <!DOCTYPE html>
      <html lang="en" class="dark">
      <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>#{title}</title>
          <link rel="stylesheet" href="#{base}/styles/tokens.css">
          <link rel="stylesheet" href="#{base}/styles/layout.css">
          <link rel="stylesheet" href="#{base}/styles/components.css">
          <link rel="stylesheet" href="#{base}/styles/todo-app.css">
          #{extra_css}
      </head>
      <body>
          <header class="bf-header">
              <div class="bf-header-inner">
                  <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="BarefootJS">
                      <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
                  </a>
                  <div class="bf-header-sep"></div>
                  <nav class="bf-header-crumbs" aria-label="Breadcrumb">
                      <a href="/integrations" class="bf-header-link">Integrations</a>
                      <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
                      <span class="bf-header-current" aria-current="page">Rails</span>
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
  # Session helpers — port of the Sinatra example's Mutex-guarded, cookie-keyed
  # in-memory todo store, using Rails' cookies API.
  # -----------------------------------------------------------------------
  def bf_session
    id = cookies[ExampleApp::SESSION_COOKIE]
    if id.nil? || id.empty?
      id = SecureRandom.hex(16)
      cookies[ExampleApp::SESSION_COOKIE] = {
        value: id,
        path: ExampleApp::BASE,
        httponly: true,
        same_site: :lax,
        expires: Time.now + ExampleApp::SESSION_TTL_SEC,
      }
    end

    ExampleApp::SESSIONS_MUTEX.synchronize do
      unless ExampleApp::SESSIONS.key?(id)
        ExampleApp::SESSIONS[id] = { todos: ExampleApp.seed_todos, next_id: 4 }
        ExampleApp::SESSION_ORDER.push(id)
        while ExampleApp::SESSION_ORDER.length > ExampleApp::SESSION_STORE_MAX
          ExampleApp::SESSIONS.delete(ExampleApp::SESSION_ORDER.shift)
        end
      end
      ExampleApp::SESSION_ORDER.delete(id)
      ExampleApp::SESSION_ORDER.push(id)
      ExampleApp::SESSIONS[id]
    end
  end

  def parse_json_body
    JSON.parse(request.raw_post, symbolize_names: true)
  rescue JSON::ParserError
    {}
  end
end
