# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'set'
require 'barefoot_js'

# Golden helper vectors generated from the JS reference implementations
# (spec/template-helpers.md in the monorepo). The file lives in
# packages/adapter-tests (a monorepo-only path) -- skip everywhere else.
# Structurally a Ruby port of packages/adapter-perl/t/helper_vectors.t: one
# binding per canonical helper id, bound to the exact code shape a compiled
# ERB template would execute, plus a DIVERGENCES table (loaded below) pinning
# every deliberate departure from the JS-normative `expect`.
HELPER_VECTORS_PATH = File.expand_path('../../adapter-tests/vectors/vectors.json', __dir__)
DIVERGENCES_PATH = File.expand_path('vector-divergences.json', __dir__)

class PureBackend
  def encode_json(data)
    JSON.generate(data)
  end

  def mark_raw(str)
    str
  end

  def materialize(value)
    value.respond_to?(:call) ? value.call : value
  end

  def render_named(*)
    ''
  end
end

class HelperVectorsTest < Minitest::Test
  BF = BarefootJS::Context.new(PureBackend.new)

  def self.truthy_pred(field)
    key = field.to_sym
    ->(item) { item.is_a?(Hash) ? item[key] : nil }
  end

  def self.field_eq_pred(field, value)
    key = field.to_sym
    # Ruby's `==` already distinguishes JS type (Integer 2 vs String "2"),
    # so -- unlike the Perl port, which must choose between `eq` and `==`
    # via a looks_like_number probe -- one comparison covers every probe
    # shape here without a cross-type false positive.
    ->(item) { item.is_a?(Hash) && item[key] == value }
  end

  # One binding per canonical helper id in the spec catalogue, bound to the
  # exact code shape a compiled ERB template would execute on this backend.
  # Where the adapter would lower an operation to a native Ruby operator/
  # method, the binding IS that operator/method rather than a
  # BarefootJS::Context wrapper.
  BINDINGS = {
    'add' => ->(a, b) { a + b },
    'sub' => ->(a, b) { a - b },
    'mul' => ->(a, b) { a * b },
    # `Integer#/` performs floor division in Ruby (`7/2 == 3`, not 3.5) and
    # raises on a zero Integer divisor -- neither matches JS `/`. `fdiv`
    # always returns a Float (true division) and, like JS, yields
    # +-Infinity / NaN for a zero divisor instead of raising.
    'div' => ->(a, b) { a.fdiv(b) },
    # Ruby's native `%` follows the DIVISOR's sign (Python-style); JS `%`
    # keeps the DIVIDEND's sign (C fmod-style). `Numeric#remainder` is
    # Ruby's fmod-equivalent and matches JS exactly, for both Integer and
    # Float operands, with no truncation.
    'mod' => ->(a, b) { a.remainder(b) },
    'neg' => ->(a) { -a },

    'string' => ->(v) { BF.string(v) },
    'json' => ->(v) { BF.json(v) },
    'number' => ->(v) { BF.number(v) },
    'floor' => ->(v) { BF.floor(v) },
    'ceil' => ->(v) { BF.ceil(v) },
    'round' => ->(v) { BF.round(v) },
    'to_fixed' => ->(*a) { BF.to_fixed(*a) },

    'lower' => ->(s) { BF.lc(s) },
    'upper' => ->(s) { BF.uc(s) },
    'trim' => ->(s) { BF.trim(s) },
    'trim_start' => ->(s) { BF.trim_start(s) },
    'trim_end' => ->(s) { BF.trim_end(s) },
    'starts_with' => ->(*a) { BF.starts_with(*a) },
    'ends_with' => ->(*a) { BF.ends_with(*a) },
    'replace' => ->(*a) { BF.replace(*a) },
    'replace_all' => ->(*a) { BF.replace_all(*a) },
    'repeat' => ->(*a) { BF.repeat(*a) },
    'pad_start' => ->(*a) { BF.pad_start(*a) },
    'pad_end' => ->(*a) { BF.pad_end(*a) },
    'split' => ->(*a) { BF.split(*a) },

    'len' => ->(v) { BF.length(v) },
    'at' => ->(*a) { BF.at(*a) },
    'includes' => ->(*a) { BF.includes(*a) },
    'index_of' => ->(*a) { BF.index_of(*a) },
    'last_index_of' => ->(*a) { BF.last_index_of(*a) },
    'concat' => ->(a, b) { BF.concat(a, b) },
    'slice' => ->(recv, s, e = nil) { BF.slice(recv, s, e) },
    'reverse' => ->(v) { BF.reverse(v) },
    'flat' => ->(*a) { BF.flat(*a) },
    'flat_dynamic' => ->(*a) { BF.flat_dynamic(*a) },
    'join' => ->(*a) { BF.join(*a) },
    # Array literals are native Arrays on the ERB backend.
    'arr' => ->(*a) { a },
    # A plausible ERB-adapter inline lowering for `.filter(Boolean)`:
    # `v[:arr].select { |x| bf.truthy?(x) }`. Unlike the Mojo/Kolon ports
    # (native `grep { $_ }`, i.e. PERL truthiness), this already routes
    # through JS truthiness, so it needs no divergence for the "0" case.
    'filter_truthy' => ->(recv) { recv.select { |x| BarefootJS::Evaluator.truthy?(x) } },

    'search_params_get' => ->(query, key) { BF.search_params(query).get(key) },
    'query' => ->(*a) { BF.query(*a) },

    # Higher-order entries arrive in the canonical projection form (items +
    # field [+ value]); rebuild the predicate the adapter would compile
    # (`i => i.field`, `i => i.field === value`).
    'every' => ->(recv, field) { BF.every(recv, truthy_pred(field)) },
    'some' => ->(recv, field) { BF.some(recv, truthy_pred(field)) },
    'filter' => ->(recv, field, value) { BF.filter(recv, field_eq_pred(field, value)) },
    'find' => ->(recv, field, value) { BF.find(recv, field_eq_pred(field, value)) },
    'find_index' => ->(recv, field, value) { BF.find_index(recv, field_eq_pred(field, value)) },
    'find_last' => ->(recv, field, value) { BF.find_last(recv, field_eq_pred(field, value)) },
    'find_last_index' => ->(recv, field, value) { BF.find_last_index(recv, field_eq_pred(field, value)) },

    'sort' => lambda { |recv, *spec_flat|
      keys = []
      while spec_flat.length >= 4
        kind, name, compare_type, direction = spec_flat.shift(4)
        keys << { key_kind: kind, key: name, compare_type: compare_type, direction: direction }
      end
      BF.sort(recv, { keys: keys })
    },
    'reduce' => lambda { |recv, op, key_kind, key, type, init, direction|
      BF.reduce(recv, { op: op, key_kind: key_kind, key: key, type: type, init: init, direction: direction })
    },
    'flat_map' => ->(*a) { BF.flat_map(*a) },
    'flat_map_tuple' => lambda { |recv, *flat|
      specs = []
      specs << flat.shift(2) while flat.length >= 2
      BF.flat_map_tuple(recv, *specs)
    },
  }.freeze

  # Per-backend status declarations (spec/template-helpers.md "Adapter
  # status model") live in test/vector-divergences.json, package-local to
  # this adapter -- the spec stays backend-neutral. This harness still
  # fails stale/dead declarations (a pinned case that starts matching JS,
  # or a key that matches no vector case). Keyed by "fn/note".
  def self.load_divergences
    unless File.exist?(DIVERGENCES_PATH)
      raise "divergences file not found: #{DIVERGENCES_PATH} " \
            '(it is package-local and must always be present)'
    end

    # Same UTF-8 rationale as load_vectors below.
    doc = JSON.parse(File.read(DIVERGENCES_PATH, encoding: Encoding::UTF_8), symbolize_names: true)
    # Keys stay strings because the lookup key is "#{fn}/#{note}"; inner
    # values stay symbolized so value_match?'s :$num sentinel branch applies.
    [doc[:divergences].transform_keys(&:to_s), doc[:unsupported].transform_keys(&:to_s)]
  end

  DIVERGENCES, UNSUPPORTED = load_divergences.map(&:freeze)

  def self.load_vectors
    return [] unless File.exist?(HELPER_VECTORS_PATH)

    # Force UTF-8 regardless of the process locale -- JSON is UTF-8 by spec,
    # but `File.read`'s default encoding follows `Encoding.default_external`,
    # which a locale-less environment (`LANG`/`LC_ALL` unset -> POSIX) drops
    # to US-ASCII, tripping `JSON.parse` on the file's non-ASCII bytes (e.g.
    # "≡").
    JSON.parse(File.read(HELPER_VECTORS_PATH, encoding: Encoding::UTF_8), symbolize_names: true)[:cases]
  end

  VECTORS = load_vectors

  if VECTORS.empty?
    def test_skipped_outside_monorepo
      skip 'golden vectors not available outside the monorepo checkout'
    end
  else
    VECTORS.each_with_index do |vector_case, i|
      fn = vector_case[:fn]
      note = vector_case[:note]
      key = "#{fn}/#{note}"
      define_method("test_#{i}_#{key.gsub(/\W+/, '_')}") do
        if (why = UNSUPPORTED[fn])
          skip "unsupported on this backend: #{why}"
          next
        end
        bind = BINDINGS[fn]
        refute_nil bind, "no Ruby binding for helper '#{fn}' -- add it to BINDINGS in #{__FILE__}"
        next unless bind

        args = vector_case[:args]
        got = nil
        err = nil
        begin
          got = bind.call(*args)
        rescue StandardError => e
          err = e
        end

        if (d = DIVERGENCES[key])
          label = "#{key} (declared divergence: #{d[:reason]})"
          if d[:throws]
            assert err, "#{label}: expected the call to raise, got #{explain(got)}"
            next
          end
          assert_nil err, "#{label}: raised unexpectedly: #{err}"
          refute value_match?(got, vector_case[:expect]),
                 "stale divergence declaration for '#{key}' -- the backend now matches JS; remove it"
          raise "#{label}: divergence declares neither expect nor throws" unless d.key?(:expect)

          assert value_match?(got, d[:expect]), "#{label}: got #{explain(got)}, pinned #{explain(d[:expect])}"
          next
        end

        assert_nil err, "#{key} raised: #{err}"
        assert value_match?(got, vector_case[:expect]),
               "#{key}: got #{explain(got)}, want #{explain(vector_case[:expect])}"
      end
    end

    # A purely static check (no dependency on other tests having run, or on
    # minitest's randomized run order): every declared divergence key must
    # name a real "fn/note" pair in the golden vectors, or it's dead --
    # e.g. a stale pin left behind after a vector's note was reworded.
    VECTOR_KEYS = VECTORS.map { |c| "#{c[:fn]}/#{c[:note]}" }.to_set

    def test_zzz_every_divergence_declaration_matches_a_vector
      DIVERGENCES.each_key do |key|
        assert VECTOR_KEYS.include?(key), "divergence declaration '#{key}' matches no vector case -- renamed note?"
      end
    end
  end

  private

  # value_match?: the spec's value-compat comparison against a JSON-decoded
  # expect -- non-finite sentinel hashes, booleans by identity, numbers
  # numerically, arrays/hashes recursively, strings by ==.
  def value_match?(got, expect)
    return got.nil? if expect.nil?
    if expect.is_a?(Hash) && expect.key?(:$num)
      kind = expect[:$num]
      return false unless got.is_a?(Numeric)

      f = got.to_f
      return f.nan? if kind == 'NaN'
      return f.infinite? == (kind == 'Infinity' ? 1 : -1)
    end
    return got == expect if expect == true || expect == false
    if expect.is_a?(Array)
      return false unless got.is_a?(Array) && got.length == expect.length

      return got.each_index.all? { |i| value_match?(got[i], expect[i]) }
    end
    if expect.is_a?(Hash)
      return false unless got.is_a?(Hash) && got.keys.length == expect.keys.length

      return expect.keys.all? { |k| got.key?(k) && value_match?(got[k], expect[k]) }
    end
    return false if got.nil?
    return got == expect if got.is_a?(Numeric) && expect.is_a?(Numeric)

    got == expect
  end

  def explain(v)
    return 'nil' if v.nil?

    v.inspect
  end
end
