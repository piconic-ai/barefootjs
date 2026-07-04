# frozen_string_literal: true

require 'set'
require 'barefoot_js/evaluator'
require 'barefoot_js/search_params'

# BarefootJS - engine- and framework-agnostic server runtime for BarefootJS
# marked templates (ERB port).
#
# Ruby port of BarefootJS.pm (@barefootjs/perl), keeping method names 1:1
# with the Perl runtime (already snake_case) so the ERB compile-time
# adapter and this runtime share one naming contract. This module is
# deliberately template-engine- and framework-agnostic: every operation
# that depends on *how* a template is rendered -- JSON marshalling,
# raw-string marking, JSX-children materialisation, and named-template
# rendering -- is delegated to a pluggable `backend` (see
# BarefootJS::Backend::Erb for the ERB reference implementation), which
# is the only component that knows about a specific template engine.
#
# Value domain: JSON-shaped Ruby data with SYMBOL hash keys throughout
# (props, env hashes, array-of-hash records). Ruby's real Integer/Float/
# String/true/false/nil type system maps onto the JS value domain far more
# directly than Perl's blurred numeric-string scalars, so this port needs
# none of the `JSON::PP::Boolean` sentinel-detection machinery the Perl
# runtime carries -- a Ruby `true`/`false` IS a boolean, distinguishable
# from `0`/`1` for free.
module BarefootJS
  # Context is the `bf` object every compiled `.erb` template receives as a
  # local. One instance per render (root or child); `render_child` /
  # `register_components_from_manifest` construct a fresh child instance
  # per nested render, chaining scope/slot identity off the caller.
  class Context
    # ---------------------------------------------------------------------
    # Minimal get/set accessors (Perl-style: no-arg reads, one-arg writes,
    # matching BarefootJS.pm's hand-rolled accessor base so the exact same
    # calling convention -- `bf._scope_id`, `bf._scope_id('root_s0')` --
    # ports across languages unchanged).
    # ---------------------------------------------------------------------
    def self.bf_accessor(name, default: nil)
      ivar = :"@#{name.to_s.sub(/\A_/, '')}"
      define_method(name) do |*args|
        if args.empty?
          unless instance_variable_defined?(ivar)
            instance_variable_set(ivar, default ? default.call : nil)
          end
          instance_variable_get(ivar)
        else
          instance_variable_set(ivar, args.first)
          self
        end
      end
    end
    private_class_method :bf_accessor

    bf_accessor :backend
    bf_accessor :_scripts, default: -> { [] }
    bf_accessor :_script_seen, default: -> { {} }
    bf_accessor :_scope_id
    bf_accessor :_is_child, default: -> { false }
    bf_accessor :_bf_parent
    bf_accessor :_bf_mount
    bf_accessor :_props
    bf_accessor :_data_key
    bf_accessor :_child_renderers, default: -> { {} }

    def initialize(backend = nil)
      @backend = backend
    end

    # search_params(query = '') -- request-scoped reader for the reactive
    # searchParams() environment signal (router v0.5, #1922), built from a
    # raw query string. The compiled template reads it via
    # `v[:searchParams].get('key')`.
    def search_params(query = '')
      SearchParams.new(query)
    end

    # -----------------------------------------------------------------
    # Scope & Props
    # -----------------------------------------------------------------

    # bf-s is the addressable scope id only (#1249).
    def scope_attr
      _scope_id || ''
    end

    # Emits `bf-h="<host>" bf-m="<slot>" bf-r=""` conditionally. See
    # spec/compiler.md "Slot identity".
    def hydration_attrs
      parts = []
      host = _bf_parent
      mount = _bf_mount
      parts << %(bf-h="#{host.gsub('"', '&quot;')}") if host && !host.empty?
      parts << %(bf-m="#{mount.gsub('"', '&quot;')}") if mount && !mount.empty?
      parts << 'bf-r=""' unless _is_child
      parts.join(' ')
    end

    # Emits ` data-key="<key>"` for a keyed loop item, else ''. See
    # BarefootJS.pm's docstring on the client reconciliation contract.
    def data_key_attr
      k = _data_key
      return '' if k.nil?

      escaped = k.to_s.gsub('&', '&amp;').gsub('"', '&quot;')
      %( data-key="#{escaped}")
    end

    def props_attr
      props = _props
      return '' unless props && !props.empty?

      # The JSON must be attribute-escaped: a raw `'` inside a string value
      # (e.g. a blog paragraph) terminates the single-quoted attribute and
      # truncates the hydration payload. The browser entity-decodes the
      # attribute value, so the client's JSON.parse sees the original text.
      json = html_escape(backend.encode_json(props))
      %( bf-p='#{json}')
    end

    # -----------------------------------------------------------------
    # Context (SSR mirror of the client `provideContext` / `useContext`)
    # -----------------------------------------------------------------
    #
    # A `<Ctx.Provider value>` seeds a value that descendant
    # `useContext(Ctx)` consumers read during the same render. The stacks
    # live at module scope (like the Perl `my %CONTEXT_STACKS`), not on
    # `self`, because a parent template and the child templates it renders
    # via `render_child` are separate `Context` instances. SSR rendering is
    # synchronous, and push/pop are perfectly balanced, so each provider
    # subtree's stack always unwinds to empty by the time its render
    # finishes -- keeping concurrent root renders isolated.
    CONTEXT_STACKS = Hash.new { |h, k| h[k] = [] }
    private_constant :CONTEXT_STACKS

    def provide_context(name, value)
      CONTEXT_STACKS[name].push(value)
      ''
    end

    def revoke_context(name)
      stack = CONTEXT_STACKS[name]
      stack.pop unless stack.empty?
      ''
    end

    def use_context(name, default = nil)
      stack = CONTEXT_STACKS[name]
      stack.empty? ? default : stack.last
    end

    # -----------------------------------------------------------------
    # Comment Markers
    # -----------------------------------------------------------------

    def comment(text)
      "<!--bf-#{text}-->"
    end

    # Map a JS-boolean-shaped value to the JS `String(bool)` form. See
    # BarefootJS.pm's `bool_str` docstring for the boolean-only contract --
    # callers must have already classified the expression as boolean-
    # result; non-boolean attribute bindings never reach this helper.
    def bool_str(value)
      value ? 'true' : 'false'
    end

    def text_start(slot_id)
      "<!--bf:#{slot_id}-->"
    end

    def text_end
      '<!--/-->'
    end

    # See spec/compiler.md "Slot identity" for the comment-scope wire format.
    def scope_comment
      scope_id = _scope_id || ''
      host_segment = ''
      host = _bf_parent
      mount = _bf_mount
      host_segment = "|h=#{host}|m=#{mount || ''}" if host && !host.empty?
      props_json = ''
      props_json = "|#{backend.encode_json(_props)}" if _props && !_props.empty?
      "<!--bf-scope:#{scope_id}#{host_segment}#{props_json}-->"
    end

    # -----------------------------------------------------------------
    # Script Registration
    # -----------------------------------------------------------------

    def register_script(path)
      return if _script_seen.key?(path)

      _script_seen[path] = true
      _scripts.push(path)
    end

    def scripts
      _scripts.map { |path| %(<script type="module" src="#{path}"></script>) }.join("\n")
    end

    # -----------------------------------------------------------------
    # Child Component Rendering
    # -----------------------------------------------------------------

    # Register a renderer for `render_child(name, ...)`. `renderer` is
    # called as `renderer.call(props_hash, invoking_bf)` -- the invoking
    # `Context` matters because a renderer registered on the root may be
    # called from a nested child render, and the grandchild's scope / slot
    # identity must chain off the CALLER's scope id, not the registrant's
    # (#1897).
    def register_child_renderer(name, renderer)
      _child_renderers[name] = renderer
    end

    def render_child(name, *args)
      renderer = _child_renderers[name]
      raise "No renderer registered for child component '#{name}'" unless renderer

      # Accept both `render_child(name, k: v, ...)` (kwargs collapse into a
      # trailing Hash under Ruby's argument-splat rules) and the explicit
      # single-Hash form `render_child(name, { k: v })`.
      props = (args.length == 1 && args[0].is_a?(Hash)) ? args[0].dup : Hash[*args]
      # JSX children come in via the ERB backend's content-capture buffer
      # slice; materialize it through the backend so the child renderer sees
      # `props[:children]` as already-rendered HTML. Guard on `key?` so a
      # childless invocation doesn't gain a spurious `children: nil` key.
      props[:children] = backend.materialize(props[:children]) if props.key?(:children)
      renderer.call(props, self)
    end

    # -----------------------------------------------------------------
    # Bulk registration from build manifest
    # -----------------------------------------------------------------
    #
    # `bf build` emits dist/templates/manifest.json describing every
    # component the page might invoke. This walks that manifest and
    # registers one child renderer per UI registry entry (`ui/<name>/index`
    # -> slot key `<name>`), seeding each child's template vars from the
    # manifest's statically-derived `ssrDefaults` (prop destructure
    # defaults + signal/memo initial values). `signal_init[slot_key]` is an
    # opt-in override for defaults the static extractor can't see through.
    def register_components_from_manifest(manifest, signal_init: {})
      parent_scope = _scope_id
      parent = self

      manifest.each do |entry_name, entry|
        next if entry_name.to_s == '__barefoot__'

        m = entry_name.to_s.match(%r{\Aui/([^/]+)/index\z})
        next unless m

        slot_key = m[1]
        marked = entry[:markedTemplate] || ''
        next if marked.empty?

        template_name = marked.sub(%r{\Atemplates/}, '').sub(/\.erb\z/, '')
        sig_init = signal_init[slot_key]
        manifest_defaults = entry[:ssrDefaults]

        register_child_renderer(slot_key, lambda do |props, caller|
          host = caller || parent
          host_scope = host._scope_id || parent_scope
          child_bf = self.class.new(parent.backend)
          slot_id = props.delete(:_bf_slot)
          data_key = props.delete(:key)
          child_bf._data_key(data_key) unless data_key.nil?
          child_bf._scope_id(
            slot_id ? "#{host_scope}_#{slot_id}" : "#{template_name}_#{rand.to_s[2, 6]}",
          )
          child_bf._is_child(true)
          if slot_id
            child_bf._bf_parent(host_scope)
            child_bf._bf_mount(slot_id)
          end
          # Share the root registry so the child's own template can render
          # further imported components (#1897).
          child_bf._child_renderers(parent._child_renderers)
          child_bf._scripts(parent._scripts)
          child_bf._script_seen(parent._script_seen)

          extra =
            if sig_init
              sig_init.call(props)
            elsif manifest_defaults
              self.class.send(:derive_vars_from_defaults, manifest_defaults, props)
            else
              {}
            end

          html = parent.backend.render_named(template_name, child_bf, props.merge(extra))
          html.chomp
        end)
      end
    end

    # Derive template-var kvs from a manifest entry's `ssrDefaults` section.
    # Each entry shape: `{ value:, propName:, isRestProps: }`. For
    # `isRestProps`, the rest bag passes through unchanged (or the static
    # `{}` if the caller didn't supply one). For ordinary entries the
    # caller's `props[propName]` wins when present, otherwise the static
    # `value` does. `propName`-less entries (signal / memo locals) always
    # use the static value.
    #
    # Public (not `private_class_method`): `register_components_from_manifest`
    # above uses it for the `ui/*` registry path, but a page that composes
    # *flat* (non-`ui/*`) components by hand -- e.g. the blog islands in the
    # Sinatra/xslate/Mojolicious integrations -- needs the exact same
    # ssrDefaults-seeding logic for its own manual `register_child_renderer`
    # calls. Mirrors the Perl runtime's `BarefootJS::_derive_stash_from_defaults`,
    # which is likewise callable from integration code (Perl has no enforced
    # privacy; the leading underscore is convention only) -- see
    # integrations/xslate/app.psgi's `_register_blog_child` and
    # integrations/mojolicious/app.pl's equivalent.
    def self.derive_vars_from_defaults(defaults, props)
      extra = {}
      defaults.each do |name, d|
        unless d.is_a?(Hash)
          extra[name] = d
          next
        end
        if d[:isRestProps]
          extra[name] = props.key?(name) ? props[name] : d[:value]
          next
        end
        prop_name = d[:propName]
        extra[name] =
          if !prop_name.nil? && props.key?(prop_name) && !props[prop_name].nil?
            props[prop_name]
          else
            d[:value]
          end
      end
      extra
    end

    # -----------------------------------------------------------------
    # Streaming SSR (Out-of-Order)
    # -----------------------------------------------------------------

    def streaming_bootstrap
      %{<script>(function(){function s(id){var a=document.querySelector('[bf-async="'+id+'"]');var t=document.querySelector('template[bf-async-resolve="'+id+'"]');if(!a||!t)return;a.replaceChildren(t.content.cloneNode(true));a.removeAttribute('bf-async');t.remove();requestAnimationFrame(function(){if(window.__bf_hydrate)window.__bf_hydrate()})};window.__bf_swap=s})()</script>}
    end

    def async_boundary(id, fallback_html)
      fallback_html = backend.materialize(fallback_html)
      %(<div bf-async="#{id}">#{fallback_html}</div>)
    end

    def async_resolve(id, content_html)
      %(<template bf-async-resolve="#{id}">#{content_html}</template><script>__bf_swap("#{id}")</script>)
    end

    # -----------------------------------------------------------------
    # JS-compat callees -- invoked from generated ERB templates as
    # `bf.json(val)`, `bf.floor(val)`, etc. Numeric coercion follows JS
    # semantics (NaN propagates; non-numeric input yields NaN rather than
    # silently 0). `json` bubbles backend/marshalling errors loudly rather
    # than producing an empty payload.
    # -----------------------------------------------------------------

    NUMERIC_STRING_RE = /\A\s*[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?\s*\z/.freeze

    def json(value)
      backend.encode_json(value)
    end

    # JS `String(v)` mirror, EXCEPT `nil` renders as '' (not the literal
    # "null") so an unset prop doesn't surface as literal text in
    # user-facing HTML -- the same divergence the Go/Perl adapters document
    # for their `string` helper. This is the canonical JS-ish stringifier
    # used throughout this file (join, spread_attrs, `h`, reduce's string
    # fold, ...).
    def string(value)
      return '' if value.nil?
      return value ? 'true' : 'false' if value.is_a?(TrueClass) || value.is_a?(FalseClass)
      return Evaluator.number_to_string(value) if value.is_a?(Numeric)

      value.to_s
    end

    # HTML-escaping helper for text interpolation (`<%= bf.h(expr) %>` --
    # stdlib ERB does not auto-escape). JS-style stringification via
    # `string` (numbers per JS Number#toString, nil -> "", booleans ->
    # "true"/"false"), then HTML-escaped.
    def h(value)
      html_escape(string(value))
    end

    # JS truthiness (falsy: false, nil, 0, NaN, ""). Delegates to the
    # shared evaluator so template-emitted conditionals
    # (`if bf.truthy?(x)`) and callback-body evaluation agree byte-for-byte.
    def truthy?(value)
      Evaluator.truthy?(value)
    end

    # JS `Number(v)` mirror: numeric / boolean inputs convert as expected;
    # non-numeric / nil yield real numeric NaN so downstream arithmetic
    # propagates correctly (`Math.floor(NaN) === NaN`).
    def number(value)
      return Float::NAN if value.nil?
      return value ? 1 : 0 if value.is_a?(TrueClass) || value.is_a?(FalseClass)
      return value if value.is_a?(Numeric)
      return Float(value.strip) if value.is_a?(String) && value.strip =~ NUMERIC_STRING_RE

      Float::NAN
    end

    def floor(value)
      n = number(value)
      finite_number?(n) ? n.floor : n
    end

    def ceil(value)
      n = number(value)
      finite_number?(n) ? n.ceil : n
    end

    def round(value)
      n = number(value)
      finite_number?(n) ? (n + 0.5).floor : n
    end

    # -----------------------------------------------------------------
    # Array / String method helpers
    # -----------------------------------------------------------------

    # `Array.prototype.includes(x)` / `String.prototype.includes(sub)`
    # share a method name in JS; dispatch on Ruby class the way BarefootJS.pm
    # dispatches on `ref()`. The Array arm scans with
    # `Evaluator.same_value_zero?` (SameValueZero: no cross-type coercion,
    # e.g. `[2].includes("2")` is false; `NaN` matches `NaN`) -- the same
    # algorithm the evaluator's serialized-callback `array-method` path uses
    # for `.includes`, so both positions agree.
    def includes(recv, elem)
      return recv.any? { |item| Evaluator.same_value_zero?(item, elem) } if recv.is_a?(Array)
      return false if recv.is_a?(Hash)

      s = recv.nil? ? '' : string(recv)
      needle = elem.nil? ? '' : string(elem)
      s.include?(needle)
    end

    # `.filter(fn)` / `.every(fn)` / `.some(fn)` / `.find(fn)` /
    # `.findIndex(fn)` / `.findLast(fn)` / `.findLastIndex(fn)` -- legacy
    # block-predicate path for shapes the compiler lowers to a native
    # callable (e.g. a Kolon-style lambda literal). `pred` is anything
    # responding to `#call(item)`. The `_eval` family below is the
    # evaluator-driven generalisation used for arbitrary pure bodies.
    def filter(recv, pred)
      return [] unless recv.is_a?(Array)

      recv.select { |item| pred.call(item) }
    end

    def every(recv, pred)
      return true unless recv.is_a?(Array)

      recv.all? { |item| pred.call(item) }
    end

    def some(recv, pred)
      return false unless recv.is_a?(Array)

      recv.any? { |item| pred.call(item) }
    end

    def find(recv, pred)
      return nil unless recv.is_a?(Array)

      recv.find { |item| pred.call(item) }
    end

    def find_index(recv, pred)
      return -1 unless recv.is_a?(Array)

      recv.each_index { |i| return i if pred.call(recv[i]) }
      -1
    end

    def find_last(recv, pred)
      return nil unless recv.is_a?(Array)

      recv.reverse_each { |item| return item if pred.call(item) }
      nil
    end

    def find_last_index(recv, pred)
      return -1 unless recv.is_a?(Array)

      (recv.length - 1).downto(0) { |i| return i if pred.call(recv[i]) }
      -1
    end

    # `String.prototype.toLowerCase()` / `.toUpperCase()`.
    def lc(s)
      s.nil? ? '' : string(s).downcase
    end

    def uc(s)
      s.nil? ? '' : string(s).upcase
    end

    # `Array.prototype.join(sep)` with JS semantics: separator defaults to
    # ",", undefined/null elements render as empty.
    def join(recv, sep = nil)
      return '' unless recv.is_a?(Array)

      sep = ',' if sep.nil?
      recv.map { |el| string(el) }.join(sep)
    end

    # `.length` works on both arrays (element count) and strings (character
    # count).
    def length(recv)
      return recv.length if recv.is_a?(Array)
      return 0 if recv.is_a?(Hash) || recv.nil?

      string(recv).length
    end

    # `Array.prototype.indexOf(x)` / `.lastIndexOf(x)` -- value-equality
    # search. Non-array receivers return -1.
    def index_of(recv, elem)
      array_index_of(recv, elem, false)
    end

    def last_index_of(recv, elem)
      array_index_of(recv, elem, true)
    end

    # `Array.prototype.at(i)` -- negative indices count from the end;
    # out-of-bounds -> nil (renders as '' via `h`, matching JS `undefined`).
    def at(recv, i)
      return nil unless recv.is_a?(Array)
      return nil if i.nil?

      idx = i.to_i
      len = recv.length
      return nil if len.zero?

      idx = len + idx if idx.negative?
      return nil if idx.negative? || idx >= len

      recv[idx]
    end

    # `Array.prototype.concat(other)` -- merges two arrays in order into a
    # new Array. Non-array operands collapse to empty.
    def concat(a, b)
      out = []
      out.concat(a) if a.is_a?(Array)
      out.concat(b) if b.is_a?(Array)
      out
    end

    # `Array.prototype.slice(start, end?)`. Mirrors the Go/Perl `bf_slice` /
    # `slice` arithmetic so adapter output stays symmetric.
    def slice(recv, start, end_ = nil)
      return [] unless recv.is_a?(Array)

      len = recv.length
      return [] if len.zero?

      s = start.nil? ? 0 : start.to_i
      s = len + s if s.negative?
      s = 0 if s.negative?
      s = len if s > len

      e = end_.nil? ? len : end_.to_i
      e = len + e if e.negative?
      e = 0 if e.negative?
      e = len if e > len

      return [] if s >= e

      recv[s...e]
    end

    # `Array.prototype.reverse()` / `.toReversed()` -- always returns a new
    # Array (SSR renders a snapshot; the mutate-vs-copy JS distinction is
    # moot here).
    def reverse(recv)
      recv.is_a?(Array) ? recv.reverse : []
    end

    # `Array.prototype.flat(depth?)` -- flatten nested arrays `depth` levels
    # deep. `depth` of -1 is the `Infinity` sentinel (flatten fully); 0
    # returns a shallow copy.
    def flat(recv, depth = 1)
      return [] unless recv.is_a?(Array)

      out = []
      recv.each do |el|
        if !depth.zero? && el.is_a?(Array)
          out.concat(flat(el, depth.positive? ? depth - 1 : depth))
        else
          out << el
        end
      end
      out
    end

    # `Array.prototype.flatMap(fn)` value-returning field projection: map
    # each element through a self/field projection, then flatten one level.
    def flat_map(recv, key_kind, key)
      return [] unless recv.is_a?(Array)

      projected = recv.map { |el| key_kind == 'field' ? field_value(el, key) : el }
      flat(projected, 1)
    end

    # `Array.prototype.flatMap(i => [i.a, i.b])` -- array-literal tuple
    # projection. Each spec is `[kind, key]` (`['self', '']` or
    # `['field', 'a']`).
    def flat_map_tuple(recv, *specs)
      return [] unless recv.is_a?(Array)

      out = []
      recv.each do |el|
        specs.each do |kind, key|
          out << (kind == 'field' ? field_value(el, key) : el)
        end
      end
      out
    end

    # `String.prototype.trim()`.
    def trim(recv)
      return '' if recv.nil? || recv.is_a?(Array) || recv.is_a?(Hash)

      string(recv).gsub(/\A\p{Space}+|\p{Space}+\z/, '')
    end

    # `Number.prototype.toFixed(digits)` -- fixed-decimal string with
    # zero-padding, rounding half toward +Infinity (matching `round`).
    def to_fixed(value, digits = 0)
      n = number(value)
      return 'NaN' if n.respond_to?(:nan?) && n.nan?
      return n.negative? ? '-Infinity' : 'Infinity' if n.respond_to?(:infinite?) && n.infinite?

      digits = 0 if digits.nil? || digits.negative?
      factor = 10.0**digits
      rounded = (n * factor + 0.5).floor
      format("%.#{digits}f", rounded / factor)
    end

    # `String.prototype.split(sep)` -- string -> Array. An empty separator
    # splits into individual characters; a nil separator returns the whole
    # string in a single-element Array; trailing empty fields are kept
    # (JS parity -- Ruby's `String#split(str, -1)` already matches this,
    # and (unlike a Regexp) a String separator is matched literally).
    def split(recv, sep = nil, limit = nil)
      s = (recv.nil? || recv.is_a?(Array) || recv.is_a?(Hash)) ? '' : string(recv)
      parts =
        if sep.nil?
          [s]
        elsif string(sep).empty?
          s.chars
        elsif s.empty?
          ['']
        else
          s.split(string(sep), -1)
        end
      unless limit.nil?
        n = limit.to_i
        if n.zero?
          parts = []
        elsif n.positive? && n < parts.length
          parts = parts[0...n]
        end
      end
      parts
    end

    # `String.prototype.startsWith(prefix, position?)`.
    def starts_with(recv, prefix, position = nil)
      s = recv.nil? ? '' : string(recv)
      p = prefix.nil? ? '' : string(prefix)
      unless position.nil?
        n = clamp_index(position.to_i, s.length)
        s = s[n..] || ''
      end
      s.start_with?(p)
    end

    # `String.prototype.endsWith(suffix, endPosition?)`.
    def ends_with(recv, suffix, end_position = nil)
      s = recv.nil? ? '' : string(recv)
      x = suffix.nil? ? '' : string(suffix)
      unless end_position.nil?
        e = clamp_index(end_position.to_i, s.length)
        s = s[0...e]
      end
      s.end_with?(x)
    end

    # `String.prototype.replace(pattern, replacement)` -- string-pattern
    # form only, replacing the FIRST occurrence, literally (no regex
    # metacharacters, no `$1`-style replacement interpolation).
    def replace(recv, pattern, replacement)
      s = recv.nil? ? '' : string(recv)
      o = pattern.nil? ? '' : string(pattern)
      n = replacement.nil? ? '' : string(replacement)
      return n + s if o.empty?

      idx = s.index(o)
      return s if idx.nil?

      s[0...idx] + n + s[(idx + o.length)..]
    end

    # `queryHref(base, { ... })` (#2042) -- build "base?k=v&..." from a flat
    # list of (guard, key, value) triples. A pair is included iff its guard
    # is truthy AND its value is a non-empty string. A value may instead be
    # an Array, which APPENDS one pair per non-empty member. Repeating a key
    # overwrites the value at its first position (`URLSearchParams.set`
    # semantics); array members always append (`.append` semantics).
    def query(base, *triples)
      b = base.nil? ? '' : string(base)
      pairs = []
      pos = {}
      i = 0
      while i + 2 < triples.length
        guard, key, val = triples[i], triples[i + 1], triples[i + 2]
        i += 3
        next unless truthy?(guard)

        k = key.nil? ? '' : string(key)
        if val.is_a?(Array)
          val.each do |m|
            sm = string(m)
            pairs << [k, sm] unless sm.empty?
          end
          next
        end
        v = val.nil? ? '' : string(val)
        next if v.empty?

        if pos.key?(k)
          pairs[pos[k]][1] = v
        else
          pos[k] = pairs.length
          pairs << [k, v]
        end
      end
      return b if pairs.empty?

      "#{b}?#{pairs.map { |pk, pv| "#{form_escape(pk)}=#{form_escape(pv)}" }.join('&')}"
    end

    # `String.prototype.repeat(n)` -- a count <= 0 degrades to '' rather
    # than raising (JS throws RangeError for negative counts; SSR
    # templates degrade instead of dying mid-render).
    def repeat(recv, count)
      s = recv.nil? ? '' : string(recv)
      n = count.nil? ? 0 : count.to_i
      n.positive? ? s * n : ''
    end

    # `String.prototype.padStart` / `padEnd`.
    def pad_start(recv, target, pad_str = nil)
      pad_string(recv.nil? ? '' : string(recv), target, pad_str, true)
    end

    def pad_end(recv, target, pad_str = nil)
      pad_string(recv.nil? ? '' : string(recv), target, pad_str, false)
    end

    # `Array.prototype.sort(cmp)` / `.toSorted(cmp)` -- fixed comparator
    # catalogue (legacy, pre-#2018 path; `sort_eval` below handles arbitrary
    # comparator bodies). `opts[:keys]` is a priority-ordered list of
    # `{ key_kind:, key:, compare_type:, direction: }`. Stable (ties break
    # on original index) and non-mutating.
    def sort(recv, opts = {})
      return [] unless recv.is_a?(Array)

      spec = (opts[:keys] || []).map do |k|
        {
          key_kind: k[:key_kind] || 'self',
          key: k[:key] || '',
          compare_type: k[:compare_type] || 'numeric',
          direction: k[:direction] || 'asc',
        }
      end
      return recv.dup if spec.empty?

      decorated = recv.each_with_index.map do |item, idx|
        keys = spec.map { |sp| sp[:key_kind] == 'field' ? field_value(item, sp[:key]) : item }
        [keys, item, idx]
      end

      sorted = decorated.sort do |x, y|
        result = 0
        spec.each_index do |i|
          c = compare_sort_key(x[0][i], y[0][i], spec[i][:compare_type])
          next if c.zero?

          result = spec[i][:direction] == 'desc' ? -c : c
          break
        end
        result.zero? ? (x[2] <=> y[2]) : result
      end

      sorted.map { |pair| pair[1] }
    end

    # Fold an array into a scalar via the arithmetic-fold catalogue
    # (legacy, pre-#2018 path; `reduce_eval` below handles arbitrary
    # reducer bodies). `opts`: `{ op: '+'|'*', key_kind:, key:,
    # type: 'numeric'|'string', init:, direction: 'left'|'right' }`.
    def reduce(recv, opts = {})
      op = opts[:op] || '+'
      key_kind = opts[:key_kind] || 'self'
      key = opts[:key] || ''
      type = opts[:type] || 'numeric'
      direction = opts[:direction] || 'left'

      items = recv.is_a?(Array) ? recv.dup : []
      items.reverse! if direction == 'right'
      project = lambda { |item| key_kind == 'field' ? field_value(item, key) : item }

      if type == 'string'
        acc = opts[:init].nil? ? '' : string(opts[:init])
        items.each { |item| acc += string(project.call(item)) }
        return acc
      end

      # `init` rides through the adapter as whatever literal the template
      # emits -- often a numeric-looking String (JSON-decoded, not a Ruby
      # numeric literal) -- so route it through the same numeric coercion
      # as every per-element projection rather than trusting its Ruby class.
      acc = opts[:init].nil? ? 0 : numeric_or_zero(opts[:init])
      items.each do |item|
        n = numeric_or_zero(project.call(item))
        acc = op == '*' ? acc * n : acc + n
      end
      acc
    end

    # -----------------------------------------------------------------
    # Evaluator-driven sort / reduce / higher-order predicates (#2018):
    # the comparator / reducer / predicate body rides as a serialized-
    # ParsedExpr JSON string and is evaluated per element, delegating to
    # the shared BarefootJS::Evaluator. `find_eval` / `find_index_eval`
    # take a `forward` flag (false -> findLast / findLastIndex).
    # -----------------------------------------------------------------

    def sort_eval(recv, cmp_json, param_a, param_b, base_env = {})
      Evaluator.sort_by_json(recv, cmp_json, param_a, param_b, base_env)
    end

    def reduce_eval(recv, body_json, acc_name, item_name, init, direction = 'left', base_env = {})
      Evaluator.fold_json(recv, body_json, acc_name, item_name, init, direction, base_env)
    end

    def filter_eval(recv, pred_json, param, base_env = {})
      Evaluator.filter_json(recv, pred_json, param, base_env)
    end

    def every_eval(recv, pred_json, param, base_env = {})
      Evaluator.every_json(recv, pred_json, param, base_env)
    end

    def some_eval(recv, pred_json, param, base_env = {})
      Evaluator.some_json(recv, pred_json, param, base_env)
    end

    def find_eval(recv, pred_json, param, forward = true, base_env = {})
      Evaluator.find_json(recv, pred_json, param, forward, base_env)
    end

    def find_index_eval(recv, pred_json, param, forward = true, base_env = {})
      Evaluator.find_index_json(recv, pred_json, param, forward, base_env)
    end

    def flat_map_eval(recv, proj_json, param, base_env = {})
      Evaluator.flat_map_json(recv, proj_json, param, base_env)
    end

    def map_eval(recv, proj_json, param, base_env = {})
      Evaluator.map_json(recv, proj_json, param, base_env)
    end

    # -----------------------------------------------------------------
    # JSX intrinsic-element spread (#1407)
    # -----------------------------------------------------------------
    #
    # Mirrors the JS `spreadAttrs` runtime and the Go/Perl adapters'
    # spread helpers so SSR output stays byte-equal across adapters.
    # Generated ERB templates invoke this as `<%= bf.spread_attrs(bag) %>`.
    #
    # Skip rules: nil/false values, event handlers (`on[A-Z]...`), and
    # `children`. `ref` is intentionally NOT filtered (matches the JS
    # reference). Key remap: className -> class, htmlFor -> for; SVG
    # camelCase attrs preserved; other camelCase keys lowered to
    # kebab-case. `style` routes through `style_to_css`. Output is
    # deterministic: keys are sorted alphabetically before emission.
    #
    # Unlike the Perl/Go ports, no boolean-sentinel detection is needed --
    # Ruby's `true`/`false` are real booleans, distinct from `0`/`1`, so a
    # bag value's Ruby class alone tells JS-boolean from JS-number.
    def spread_attrs(bag)
      return '' unless bag.is_a?(Hash)

      parts = []
      bag.keys.sort_by(&:to_s).each do |key|
        key_s = key.to_s
        if key_s.length > 2 && key_s.start_with?('on')
          c = key_s[2]
          next if c.upcase == c
        end
        next if key_s == 'children'

        val = bag[key]
        next if val.nil?

        if val.is_a?(TrueClass) || val.is_a?(FalseClass)
          next unless val

          parts << to_attr_name(key_s)
          next
        end

        if key_s == 'style'
          css = style_to_css(val)
          next if css.nil? || css.empty?

          parts << %(style="#{html_escape(css)}")
          next
        end

        parts << %(#{to_attr_name(key_s)}="#{html_escape(string(val))}")
      end
      return '' if parts.empty?

      # Mark the result raw so the calling template's plain `<%=` doesn't
      # need a second escape pass (the backend decides how "raw" is
      # represented for its engine; ERB's own emit has no auto-escape, so
      # BarefootJS::Backend::Erb's `mark_raw` is the identity function).
      backend.mark_raw(parts.join(' '))
    end

    private

    def finite_number?(n)
      !(n.respond_to?(:nan?) && n.nan?) && !(n.respond_to?(:infinite?) && n.infinite?)
    end

    def html_escape(s)
      s.gsub('&', '&amp;').gsub('<', '&lt;').gsub('>', '&gt;').gsub('"', '&#34;').gsub("'", '&#39;')
    end

    SVG_CAMEL_CASE_ATTRS = Set.new(%w[
                                      allowReorder attributeName attributeType autoReverse
                                      baseFrequency baseProfile calcMode clipPathUnits
                                      contentScriptType contentStyleType diffuseConstant edgeMode
                                      externalResourcesRequired filterRes filterUnits glyphRef
                                      gradientTransform gradientUnits kernelMatrix kernelUnitLength
                                      keyPoints keySplines keyTimes lengthAdjust limitingConeAngle
                                      markerHeight markerUnits markerWidth maskContentUnits
                                      maskUnits numOctaves pathLength patternContentUnits
                                      patternTransform patternUnits pointsAtX pointsAtY pointsAtZ
                                      preserveAlpha preserveAspectRatio primitiveUnits refX refY
                                      repeatCount repeatDur requiredExtensions requiredFeatures
                                      specularConstant specularExponent spreadMethod startOffset
                                      stdDeviation stitchTiles surfaceScale systemLanguage
                                      tableValues targetX targetY textLength viewBox viewTarget
                                      xChannelSelector yChannelSelector zoomAndPan
                                    ]).freeze
    private_constant :SVG_CAMEL_CASE_ATTRS

    def to_attr_name(key)
      return 'class' if key == 'className'
      return 'for' if key == 'htmlFor'
      return key if SVG_CAMEL_CASE_ATTRS.include?(key)

      # camelCase -> kebab-case, with a leading '-' for an initial uppercase
      # letter (JS-reference parity, even though that case produces an
      # HTML-invalid attribute name -- same documented behaviour as the
      # Go/Perl adapters' `toAttrName`).
      key.gsub(/([A-Z])/) { "-#{Regexp.last_match(1).downcase}" }
    end

    def style_to_css(value)
      return nil if value.nil?
      unless value.is_a?(Hash)
        s = string(value)
        return s.empty? ? nil : s
      end
      parts = value.keys.sort_by(&:to_s).filter_map do |key|
        v = value[key]
        next if v.nil?

        prop = key.to_s.gsub(/([A-Z])/) { "-#{Regexp.last_match(1).downcase}" }
        "#{prop}:#{string(v)}"
      end
      parts.empty? ? nil : parts.join(';')
    end

    # application/x-www-form-urlencoded serialisation, matching the
    # browser's URLSearchParams (which the SSR query render must equal):
    # keep ASCII alphanumerics and `* - . _`; encode every other byte as
    # `%XX` (upper hex); space -> `+`. Non-ASCII is encoded byte-wise over
    # its UTF-8 bytes.
    def form_escape(s)
      bytes = (s || '').to_s.encode('UTF-8').b
      escaped = bytes.gsub(/[^A-Za-z0-9*\-._ ]/n) { |c| format('%%%02X', c.ord) }
      escaped.tr(' ', '+')
    end

    def field_value(item, key)
      item.is_a?(Hash) ? item[field_key(key)] : nil
    end

    def field_key(key)
      key.is_a?(Symbol) ? key : key.to_s.to_sym
    end

    def numeric_like?(v)
      return true if v.is_a?(Numeric)

      v.is_a?(String) && v.strip =~ NUMERIC_STRING_RE
    end

    def numeric_value(v)
      return 0 if v.nil?
      return v if v.is_a?(Numeric)
      return Float(v.strip) if v.is_a?(String) && v.strip =~ NUMERIC_STRING_RE

      0
    end

    def numeric_or_zero(v)
      numeric_like?(v) ? numeric_value(v) : 0
    end

    # Compare two projected sort keys, ascending orientation (-1/0/1); the
    # caller negates for 'desc'. 'auto' compares numerically when both keys
    # look like numbers, else lexically.
    def compare_sort_key(av, bv, compare_type)
      case compare_type
      when 'string'
        (av.nil? ? '' : string(av)) <=> (bv.nil? ? '' : string(bv))
      when 'auto'
        if numeric_like?(av) && numeric_like?(bv)
          numeric_value(av) <=> numeric_value(bv)
        else
          (av.nil? ? '' : string(av)) <=> (bv.nil? ? '' : string(bv))
        end
      else
        numeric_value(av) <=> numeric_value(bv)
      end
    end

    def array_index_of(recv, elem, reverse)
      return -1 unless recv.is_a?(Array)

      indices = reverse ? (recv.length - 1).downto(0).to_a : (0...recv.length).to_a
      indices.each do |i|
        item = recv[i]
        if item.nil?
          return i if elem.nil?

          next
        end
        return i if !elem.nil? && item == elem
      end
      -1
    end

    def clamp_index(n, len)
      n = 0 if n.negative?
      n = len if n > len
      n
    end

    def pad_string(s, target, pad_str, at_start)
      pad_str = pad_str.nil? ? ' ' : string(pad_str)
      return s if pad_str.empty?

      len = s.length
      t = target.nil? ? 0 : target.to_i
      return s if len >= t

      need = t - len
      fill = (pad_str * ((need / pad_str.length) + 1))[0, need]
      at_start ? fill + s : s + fill
    end
  end
end
