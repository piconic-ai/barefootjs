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
    #   mark_raw(str)                -> identity (ERB has no "safe string"
    #                                    wrapper type -- ERB's own `<%=` is
    #                                    NOT auto-escaping, so the compiled
    #                                    templates that need escaping call
    #                                    `bf.h(...)` explicitly; `mark_raw`
    #                                    only exists so runtime helpers that
    #                                    already produce finished HTML --
    #                                    e.g. spread_attrs -- share one
    #                                    interface with the Kolon/EP ports)
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
      def initialize(path:, json_encoder: nil)
        @dir = path
        @json_encoder = json_encoder || ->(data) { JSON.generate(data) }
        @cache = {}
      end

      def encode_json(data)
        @json_encoder.call(data)
      end

      # ERB has no "already-safe" string wrapper the way Kolon's `mark_raw`
      # or Mojo::ByteStream do -- stdlib ERB's `<%=` never auto-escapes, so
      # there is nothing to opt out of. Identity, kept only so runtime
      # helpers (`spread_attrs`) share one `backend.mark_raw(...)` call
      # shape across every BarefootJS backend port.
      def mark_raw(str)
        str
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
        @cache[name] ||= begin
          file = File.join(@dir, "#{name}.erb")
          src = File.read(file, encoding: 'UTF-8')
          ERB.new(src, trim_mode: '-', eoutvar: '_erbout')
        end
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
