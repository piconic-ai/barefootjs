# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'barefoot_js'
require_relative 'vector_undefined'

# JS primitive-operation vector conformance (spec/js-primitive-semantics.md,
# "Conformance"): every packages/adapter-tests/vectors/primitives/<op>.json
# case runs against the BarefootJS::Context helper a compiled ERB template
# calls for that operation. Every case must pass. Skipped outside a monorepo
# checkout.
PRIMITIVES_VECTORS_DIR = File.expand_path('../../adapter-tests/vectors', __dir__)
PRIMITIVE_FILES = Dir.glob(File.join(PRIMITIVES_VECTORS_DIR, 'primitives', '*.json')).sort

class PrimitiveVectorsTest < Minitest::Test
  BF = BarefootJS::Context.new(nil)

  # One binding per op, to the helper compiled templates call. An op with no
  # binding fails.
  BINDINGS = {
    'truthy' => ->(v) { BF.truthy?(v) },
    'to_number' => ->(v) { BF.to_number(v) },
    'to_string' => ->(v) { BF.to_string(v) },
    'get' => ->(r, k) { BF.get(r, k) },
    'strict_eq' => ->(a, b) { BF.strict_eq(a, b) },
    'lt' => ->(a, b) { BF.lt(a, b) },
    'le' => ->(a, b) { BF.le(a, b) },
    'gt' => ->(a, b) { BF.gt(a, b) },
    'ge' => ->(a, b) { BF.ge(a, b) },
    'plus' => ->(a, b) { BF.plus(a, b) },
    'neg' => ->(v) { BF.neg(v) },
    'number' => ->(v) { BF.number(v) }
  }.freeze

  # One binding per op the ERB adapter can spell natively, to the native Ruby
  # operator: a test is Ruby's own truthiness (`if`, `!`, `?:`); an index read
  # is Ruby's own `[]`; a number literal is a Ruby literal; a relational
  # operator is Ruby's own `<` / `<=` / `>` / `>=`; a unary `+` over a number
  # is the operand itself. It runs over the
  # cases whose domain the adapter's NATIVE_SAFE table claims
  # (primitives-native-safe.json; spec/js-primitive-semantics.md,
  # "Conformance" item 3).
  NATIVE_BINDINGS = {
    'truthy' => ->(v) { v ? true : false },
    'get' => ->(recv, key) { recv[key] },
    # The argument is a vector's JS spelling of a safe integer (`-3`), which
    # is also Ruby literal syntax; the template evaluates the same text.
    'number' => ->(text) { Kernel.eval(text) },
    'to_number' => ->(v) { v },
    'lt' => ->(a, b) { a < b },
    'le' => ->(a, b) { a <= b },
    'gt' => ->(a, b) { a > b },
    'ge' => ->(a, b) { a >= b },
    # A strict equality over a proven pair is Ruby's own `==` (#3824 step 8).
    'strict_eq' => ->(a, b) { a == b },
    # A proven string is its own ToString; a `+` is Ruby's own `+` over two
    # numbers, and over a proven string the other operand goes through
    # `to_string` first (#3824 step 4).
    'to_string' => ->(v) { v },
    'plus' => lambda { |a, b|
      next a + b unless a.is_a?(String) || b.is_a?(String)

      (a.is_a?(String) ? a : BF.to_string(a)) + (b.is_a?(String) ? b : BF.to_string(b))
    }
  }.freeze

  SENTINELS = {
    'NaN' => Float::NAN, 'Infinity' => Float::INFINITY, '-Infinity' => -Float::INFINITY, '-0' => -0.0
  }.freeze

  # Materializes the `{"$num": ...}` sentinel, `-0` included. Hash keys stay
  # symbols, the evaluator's value domain.
  def self.decode(v)
    return v.map { |x| decode(x) } if v.is_a?(Array)
    return SENTINELS.fetch(v[:$num]) if v.is_a?(Hash) && v.keys == [:$num]
    return v.transform_values { |x| decode(x) } if v.is_a?(Hash)

    v
  end

  # The primitives contract: types are strict (true/false for a boolean, a
  # Numeric for a number, a String for a string), numbers compare as doubles
  # and a zero compares by sign.
  def self.match?(got, expect)
    return VectorUndefined.runtime_undefined?(got) if VectorUndefined.sentinel?(expect)

    case expect
    # `UNDEF.nil?` is true: a `null` expect wants host nil itself.
    when nil then BarefootJS.null?(got)
    when true, false then got == expect
    when Numeric then number_match?(got, expect)
    when Array then got.is_a?(Array) && got.size == expect.size && got.zip(expect).all? { |g, e| match?(g, e) }
    when Hash
      got.is_a?(Hash) && got.size == expect.size && expect.all? { |k, v| got.key?(k) && match?(got[k], v) }
    else got.is_a?(String) && got == expect
    end
  end

  def self.number_match?(got, expect)
    return false unless got.is_a?(Numeric)
    # A JS number is a double: an Integer past 2^53 is a value no double
    # holds, so `to_f` below would round it and hide the difference.
    return false if got.is_a?(Integer) && got.abs > 2**53

    g = got.to_f
    e = expect.to_f
    return g.nan? if e.nan?
    return (1.0 / g).negative? == (1.0 / e).negative? if g.zero? && e.zero?

    g == e
  end

  def self.run_case(c, bind = BINDINGS[c[:fn]])
    return [false, "no Ruby binding for '#{c[:fn]}' -- add it to BINDINGS"] unless bind

    begin
      got = bind.call(*c[:args].map { |a| VectorUndefined.to_arg(decode(a)) })
    rescue StandardError => e
      return [false, "raised #{e.class}: #{e.message}"]
    end
    expect = decode(c[:expect])
    match?(got, expect) ? [true, ''] : [false, "got #{got.inspect}, want #{expect.inspect}"]
  end

  def test_primitive_vectors
    skip 'primitive vectors not available outside the monorepo checkout' if PRIMITIVE_FILES.empty?

    problems = []
    total = passed = 0
    PRIMITIVE_FILES.each do |path|
      JSON.parse(File.read(path, encoding: Encoding::UTF_8), symbolize_names: true)[:cases].each do |c|
        key = "#{c[:fn]}/#{c[:note]}"
        total += 1
        ok, detail = self.class.run_case(c)
        passed += 1 if ok
        problems << "FAIL #{key}: #{detail}" unless ok
      end
    end
    puts "primitives: #{total} cases, #{passed} pass"
    assert_empty problems, "\n#{problems.join("\n")}"
  end

  # Every native claim gives the JS answer on every case it covers.
  def test_native_claims
    skip 'primitive vectors not available outside the monorepo checkout' if PRIMITIVE_FILES.empty?

    claims_path = File.join(PRIMITIVES_VECTORS_DIR, 'primitives-native-safe.json')
    claims = JSON.parse(File.read(claims_path, encoding: Encoding::UTF_8))['runtimes'].fetch('ruby')
    problems = []
    ran = 0
    claims.each do |fn, domains|
      bind = NATIVE_BINDINGS[fn]
      next problems << "no native Ruby binding for '#{fn}' -- add it to NATIVE_BINDINGS" unless bind

      path = File.join(PRIMITIVES_VECTORS_DIR, 'primitives', "#{fn}.json")
      JSON.parse(File.read(path, encoding: Encoding::UTF_8), symbolize_names: true)[:cases].each do |c|
        next unless domains.include?(c[:domain])

        ran += 1
        ok, detail = self.class.run_case(c, bind)
        problems << "NATIVE-FAIL #{c[:fn]}/#{c[:note]} (domain #{c[:domain]}): #{detail}" unless ok
      end
    end
    puts "primitives (native): #{ran} claimed cases"
    assert_empty problems, "\n#{problems.join("\n")}"
  end
end
