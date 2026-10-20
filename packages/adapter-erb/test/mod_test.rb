# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# bf.mod -- JS `%` for the template-emitted remainder (#3474). Ruby's `%`
# floors, so the result takes the divisor's sign; JS truncates, so it takes
# the dividend's.
class BfModPureBackend
  def mark_raw(str)
    str
  end
end

class BfModTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(BfModPureBackend.new)
  end

  def text(left, right)
    @bf.string(@bf.mod(left, right))
  end

  def test_result_takes_the_dividend_sign
    assert_equal '-1', text(-7, 2)
    assert_equal '1', text(7, -2)
    assert_equal '-1', text(-7, -2)
    assert_equal '1', text(7, 2)
  end

  def test_integer_operands_keep_an_integer_result
    assert_kind_of Integer, @bf.mod(-7, 2)
  end

  def test_fractional_operands
    assert_equal '1.5', text(7.5, 2)
    assert_equal '-1.5', text(-7.5, 2)
  end

  def test_zero_divisor_and_non_finite_operands_follow_js
    assert_equal 'NaN', text(7, 0)
    assert_equal 'NaN', text(7.5, 0.0)
    assert_equal 'NaN', text(Float::NAN, 2)
    assert_equal 'NaN', text(Float::INFINITY, 2)
    assert_equal '7', text(7, Float::INFINITY)
  end

  def test_a_nil_operand_reads_as_zero
    assert_equal '0', text(nil, 3)
  end

  # Template-emitted `%` (`bf.mod`) and callback-body `%` (the evaluator)
  # share one implementation, so moving a remainder between the two never
  # changes its result.
  def test_template_and_callback_remainder_agree
    operands = [[-7, 2], [7, -2], [-7, -2], [7.5, 2], [7, 0], [nil, 3], ['7', 2]]
    operands.each do |left, right|
      node = {
        kind: 'binary', op: '%',
        left: { kind: 'identifier', name: 'l' },
        right: { kind: 'identifier', name: 'r' },
      }
      callback = BarefootJS::Evaluator.evaluate(node, { l: left, r: right })
      assert_equal @bf.string(callback), text(left, right), "#{left.inspect} % #{right.inspect}"
    end
  end
end
