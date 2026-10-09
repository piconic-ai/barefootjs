# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# Evaluator.number_to_string -- JS Number#toString notation (#3380): decimal
# within [1e-6, 1e21), an unpadded lower-case exponent outside it, and the
# shortest digits padded with zeros for integers past 2**53.
class NumberToStringTest < Minitest::Test
  CASES = [
    [1_234_567_890 / 1e15, '0.00000123456789'],
    [1_234_567_890 / 1e16, '1.23456789e-7'],
    [1_234_567_890 * 1e12, '1.23456789e+21'],
    [1e-6, '0.000001'],
    [1e-7, '1e-7'],
    [-1.5e-7, '-1.5e-7'],
    [1e20, '100000000000000000000'],
    [1e21, '1e+21'],
    [12_345_678_901_234_567_890.0, '12345678901234567000'],
    [0.1 + 0.2, '0.30000000000000004'],
    [5e-324, '5e-324'],
    [7, '7'],
  ].freeze

  def test_js_notation_at_the_boundaries
    CASES.each do |n, want|
      assert_equal want, BarefootJS::Evaluator.number_to_string(n), n.inspect
    end
  end
end
