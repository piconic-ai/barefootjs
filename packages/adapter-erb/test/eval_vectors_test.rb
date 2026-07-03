# frozen_string_literal: true

require 'minitest/autorun'
require 'json'
require 'barefoot_js/evaluator'

# Golden ParsedExpr-evaluator vectors (issue #2018, spec/compiler.md
# "ParsedExpr Evaluator Semantics"), generated from the JS reference
# evaluator and shared with the Go and Perl evaluators. The file lives in
# packages/adapter-tests (a monorepo-only path) -- skip everywhere else.
VECTORS_PATH = File.expand_path('../../adapter-tests/helper-vectors/eval-vectors.json', __dir__)

class EvalVectorsTest < Minitest::Test
  def self.load_vectors
    return [] unless File.exist?(VECTORS_PATH)

    # See the equivalent comment in helper_vectors_test.rb: force UTF-8 so
    # this doesn't depend on the process locale.
    JSON.parse(File.read(VECTORS_PATH, encoding: Encoding::UTF_8), symbolize_names: true)[:cases]
  end

  VECTORS = load_vectors

  if VECTORS.empty?
    def test_skipped_outside_monorepo
      skip 'eval vectors not available outside the monorepo checkout'
    end
  else
    VECTORS.each_with_index do |vector_case, i|
      define_method("test_#{i}_#{vector_case[:note].gsub(/\W+/, '_')}") do
        env = vector_case[:env] || {}
        got = BarefootJS::Evaluator.evaluate(vector_case[:expr], env)
        assert value_match?(got, vector_case[:expect]),
               "#{vector_case[:note]}: got #{explain(got)}, want #{explain(vector_case[:expect])}"
      end
    end
  end

  private

  # value_match?: the spec's value-compat comparison against a JSON-decoded
  # expect -- non-finite sentinel hashes ({"$num": "NaN"|"Infinity"|
  # "-Infinity"}), booleans by identity, numbers numerically, arrays/hashes
  # recursively, strings by ==. Ruby's real Integer/Float/String/true/false
  # type distinctions (unlike Perl's blurred numeric-string scalars) let this
  # stay a straightforward type + value check.
  def value_match?(got, expect)
    return got.nil? if expect.nil?
    if expect.is_a?(Hash) && expect.key?(:$num)
      kind = expect[:$num]
      return false unless got.is_a?(Numeric)

      f = got.to_f
      return f.nan? if kind == 'NaN'
      return f.infinite? == (kind == 'Infinity' ? 1 : -1)
    end
    if expect == true || expect == false
      return (got == true || got == false) && got == expect
    end
    if expect.is_a?(Array)
      return false unless got.is_a?(Array) && got.length == expect.length

      return got.each_index.all? { |i| value_match?(got[i], expect[i]) }
    end
    if expect.is_a?(Hash)
      return false unless got.is_a?(Hash) && got.keys.length == expect.keys.length

      return expect.keys.all? { |k| got.key?(k) && value_match?(got[k], expect[k]) }
    end
    return false if got.nil?

    # A number must match a number, and a string must match a string --
    # a string-vs-number type mismatch fails (e.g. String(42) must return
    # the string "42", not the number 42).
    return false if got.is_a?(Numeric) != expect.is_a?(Numeric)
    return got == expect if got.is_a?(Numeric)
    return false unless got.is_a?(String) && expect.is_a?(String)

    got == expect
  end

  def explain(v)
    return 'nil' if v.nil?
    return v.inspect if v.is_a?(String)

    v.inspect
  end
end
