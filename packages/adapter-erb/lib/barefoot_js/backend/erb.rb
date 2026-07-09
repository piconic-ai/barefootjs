# frozen_string_literal: true

require 'erb'
require 'json'

module BarefootJS
  module Backend
    # ERB rendering backend for the BarefootJS runtime.
    #
    # The engine-agnostic runtime logic -- the JS-compat value helpers,
    # array/string methods, hydration markers, child rendering -- lives in
    # `BarefootJS::Context`. This backend supplies the four engine-specific
    # operations the runtime delegates to, targeting Ruby stdlib ERB:
    #
    #   encode_json(data)            -> JSON string (injectable encoder)
    #   mark_raw(str)                -> wraps in BarefootJS::SafeString --
    #                                    ERB's own `<%=` is NOT auto-escaping,
    #                                    so most compiled templates call
    #                                    `bf.h(...)` explicitly instead of
    #                                    relying on a safe-string bypass; the
    #                                    wrapper exists for the one path that
    #                                    DOES need one -- a named-slot /
    #                                    children value captured in a parent
    #                                    template and forwarded into a
    #                                    child's vars Hash, where the child
    #                                    reads it back through the generic
    #                                    `bf.h(...)` text-expression path
    #                                    (`Context#h` unwraps SafeString to
    #                                    skip re-escaping) -- and so that
    #                                    runtime helpers which already
    #                                    produce finished HTML (e.g.
    #                                    spread_attrs) share one
    #                                    `backend.mark_raw(...)` interface
    #                                    with the Kolon/EP ports
    #   materialize(value)           -> resolve a captured-children value
    #                                    to a string
    #   render_named(name, bf, vars) -> render `<name>.erb` with `bf` and
    #                                    `v` (vars, symbol-keyed) bound
    #
    # Pair it with the @barefootjs/erb compile-time adapter, which emits
    # `.erb` templates that call the runtime as a `bf` local: `<%= bf.h(v[:x])
    # %>`, `<%= bf.spread_attrs(bag) %>`. Unlike the Perl backends, this has
    # no dependency on a web framework: a plain directory of `.erb` files
    # renders under any Rack app (or none at all).
    class Erb
      # ERB template locals contract (spec/compiler.md "ERB emission
      # contract"): every compiled template receives exactly two locals --
      # `bf` (the BarefootJS::Context for this render) and `v` (a Hash with
      # SYMBOL keys holding every prop/signal/memo/module-constant the
      # template references). This is enforced by binding `bf` and `v` as
      # local variables in a dedicated eval scope per render (see
      # `render_named`) rather than passing a generic binding, so a template
      # can never accidentally see Ruby method-local state.
      # `cache:` mirrors the Xslate/Kolon backend's `cache => $DEV ? 0 : 1`
      # constructor option: true (default, production) parses each `.erb`
      # file once and reuses the compiled ERB::Compiler output for the life
      # of the process; false (dev) re-reads and re-parses from disk on
      # every `render_named` call, so `bf build --watch` output is picked up
      # on the next request without restarting the server.
      def initialize(path:, json_encoder: nil, cache: true)
        @dir = path
        @json_encoder = json_encoder || ->(data) { JSON.generate(data) }
        @cache = {}
        @cache_enabled = cache
      end

      def encode_json(data)
        @json_encoder.call(data)
      end

      # See the class docstring's `mark_raw` entry: wraps in
      # `BarefootJS::SafeString` so `Context#h` recognises and skips
      # re-escaping already-finished HTML forwarded across a
      # parent/child template boundary.
      def mark_raw(str)
        BarefootJS::SafeString.new(str.to_s)
      end

      # JSX children captured by the adapter's buffer-slice capture
      # resolve to a plain String already; a Proc is called and its
      # result used (mirrors the Perl backends' CODE-ref materialisation
      # for engines whose children-capture mechanism yields a callable).
      def materialize(value)
        value.respond_to?(:call) ? value.call : value
      end

      # Render `<name>.erb` (relative to `path`) with `child_bf` bound as
      # `bf` and `vars` (a Hash, symbol-keyed) bound as `v`.
      def render_named(name, child_bf, vars)
        template = load_template(name)
        Renderer.new(child_bf, vars || {}).render(template)
      end

      private

      def load_template(name)
        return build_template(name) unless @cache_enabled

        @cache[name] ||= build_template(name)
      end

      def build_template(name)
        file = File.join(@dir, "#{name}.erb")
        src = File.read(file, encoding: 'UTF-8')
        ERB.new(src, trim_mode: '-', eoutvar: '_erbout')
      end

      # A dedicated per-render binding host. `bf` and `v` are the ONLY
      # locals a compiled template may reference (see the class docstring);
      # giving each render its own tiny object (rather than reusing a
      # shared binding) means concurrent / nested renders never see each
      # other's `v`.
      class Renderer
        def initialize(bf, v)
          @bf = bf
          @v = v
        end

        def render(template)
          # `bf` / `v` must be real LOCAL variables (not instance
          # variables) at the point `binding` is captured -- ERB templates
          # reference them as bare identifiers (`bf.h(...)`, `v[:x]`), and
          # `Binding` only exposes locals in scope + the object's own
          # instance variables under their own `@`-prefixed names.
          bf = @bf
          v = @v
          template.result(binding)
        end
      end
    end
  end
end
