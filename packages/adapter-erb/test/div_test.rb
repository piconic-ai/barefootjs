# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# bf.div -- JS `/` for template-emitted division (#3328). Ruby's `/` on two
# Integers is integer division; JS always yields the Number quotient.
class BfDivPureBackend
  def mark_raw(str)
    str
  end
end

class BfDivTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(BfDivPureBackend.new)
  end

  def text(left, right)
    @bf.string(@bf.div(left, right))
  end

  def test_integer_operands_keep_the_fractional_quotient
    assert_equal '308641972.5', text(1_234_567_890, 4)
    assert_equal '-1.75', text(-7, 4)
    assert_equal '3.5', text(7, 2)
  end

  def test_exact_and_zero_quotients_keep_js_integer_spelling
    assert_equal '2', text(8, 4)
    assert_equal '0', text(0, 4)
  end

  def test_fractional_operands
    assert_equal '3', text(1.5, 0.5)
    assert_equal '2.8', text(7, 2.5)
  end

  def test_division_by_zero_follows_js
    assert_equal 'Infinity', text(1, 0)
    assert_equal '-Infinity', text(-1, 0)
    assert_equal '-Infinity', text(1, -0.0)
    assert_equal 'NaN', text(0, 0)
  end

  def test_numeric_string_operand_converts_like_js_number
    assert_equal '1.5', text('6', 4)
  end
end
