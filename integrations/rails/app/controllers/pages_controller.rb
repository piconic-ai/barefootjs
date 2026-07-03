# frozen_string_literal: true

# The static-ish page group: the example index plus every non-todo, non-blog
# component demo. Each action is a 1:1 port of the matching Sinatra route.
class PagesController < ApplicationController
  def index
    base = ExampleApp::BASE
    body = <<~HTML
      <p>This example renders the same shared JSX components on Ruby on Rails
      (ERB) — a hand-trimmed Rails app (routing + controllers only, no
      ActiveRecord / asset pipeline). Rendering goes straight through
      @barefootjs/erb, exactly like the Sinatra example.</p>
      <ul>
          <li><a href="#{base}/counter">Counter</a></li>
          <li><a href="#{base}/toggle">Toggle</a></li>
          <li><a href="#{base}/todos">Todo (@client)</a></li>
          <li><a href="#{base}/todos-ssr">Todo (no @client markers)</a></li>
          <li><a href="#{base}/ai-chat">AI Chat (SSE Streaming)</a></li>
          <li><a href="#{base}/blog">Blog (@barefootjs/router - partial navigation)</a></li>
      </ul>
    HTML
    render html: layout(title: 'BarefootJS + Rails Example', heading: 'BarefootJS + Rails Example', back: '', scripts: '', body: body).html_safe, layout: false
  end

  def counter
    render_component('Counter', heading: 'Counter Component')
  end

  def toggle
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

  def form
    render_component('Form', heading: 'Form Example', props: {}, stash: { accepted: false })
  end

  def reactive_props
    render_component('ReactiveProps',
                     heading: 'Reactive Props Test',
                     children: { 'reactive_child' => 'ReactiveChild' },
                     props: {}, stash: { count: 0, doubled: 0 })
  end

  def conditional_return
    variant = params[:link] ? 'link' : ''
    render_component('ConditionalReturn',
                     heading: "Conditional Return Example#{variant.empty? ? '' : ' (Link)'}",
                     props: { variant: variant },
                     stash: { variant: variant, count: 0 })
  end

  def props_reactivity
    mk = ->(p) { { displayValue: (p[:value] || 0) * 10 } }
    render_component('PropsReactivityComparison',
                     heading: 'Props Reactivity Comparison',
                     children: { 'props_style_child' => 'PropsStyleChild', 'destructured_style_child' => 'DestructuredStyleChild' },
                     signal_init: { 'props_style_child' => mk, 'destructured_style_child' => mk },
                     props: {}, stash: { count: 1 })
  end

  def portal
    render_component('PortalExample', heading: 'Portal Example', props: {}, stash: { open: false })
  end

  def ai_chat
    render_component('AIChatInteractive',
                     title: 'AI Chat — SSE Streaming (Rails)',
                     heading: 'AI Chat — SSE Streaming',
                     stash: { messages: [], input: '', streamingText: '', isStreaming: false },
                     extra_css: %(<link rel="stylesheet" href="#{ExampleApp::BASE}/styles/ai-chat.css">))
  end
end
