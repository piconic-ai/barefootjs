# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# String receivers of bf.index_of / last_index_of / at and the position
# argument of starts_with / ends_with count UTF-16 code units, like JS
# (#3613): '本' is one unit, '😀' is two.
class BfStringIndexPureBackend
  def mark_raw(str)
    str
  end
end

class BfStringIndexMethodsTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(BfStringIndexPureBackend.new)
  end

  def test_index_of
    assert_equal 1, @bf.index_of('banana', 'an')
    assert_equal 1, @bf.index_of('日本語', '本')
    assert_equal 3, @bf.index_of('a😀b', 'b')
    assert_equal(-1, @bf.index_of('abc', 'z'))
    assert_equal 0, @bf.index_of('abc', '')
    assert_equal(-1, @bf.index_of('ab', 'abc'))
    assert_equal(-1, @bf.index_of({ 'a' => 1 }, 'a'))
  end

  def test_last_index_of
    assert_equal 3, @bf.last_index_of('banana', 'an')
    assert_equal 4, @bf.last_index_of('a😀b😀', '😀')
    assert_equal 3, @bf.last_index_of('abc', '')
    assert_equal 1, @bf.last_index_of('aaa', 'aa')
  end

  def test_at
    assert_equal '語', @bf.at('日本語', -1)
    assert_equal 'b', @bf.at('a😀b', -1)
    assert_equal 'b', @bf.at('a😀b', 3)
    assert_nil @bf.at('abc', 3)
    assert_nil @bf.at('', 0)
    # Half of a surrogate pair: U+FFFD where JS keeps a lone surrogate
    # (pinned divergence, limitation `string-at-lone-surrogate`).
    assert_equal "�", @bf.at('a😀b', 1)
  end

  # ToIntegerOrInfinity: NaN is 0, ±Infinity is out of range, fractions
  # truncate toward zero -- never a FloatDomainError.
  def test_non_finite_positions
    assert_equal 'a', @bf.at('abc', Float::NAN)
    assert_nil @bf.at('abc', Float::INFINITY)
    assert_nil @bf.at('abc', -Float::INFINITY)
    assert_equal 'b', @bf.at('abc', 1.9)
    assert_equal 'c', @bf.at('abc', -1.5)
    assert @bf.starts_with('abc', 'a', Float::NAN)
    assert @bf.starts_with('abc', '', Float::INFINITY)
    refute @bf.ends_with('abc', 'c', Float::NAN)
    assert @bf.ends_with('abc', 'c', Float::INFINITY)
  end

  def test_positions
    assert @bf.starts_with('日本語', '本', 1)
    assert @bf.starts_with('a😀b', 'b', 3)
    refute @bf.starts_with('a😀b', 'b', 2)
    assert @bf.ends_with('日本語', '本', 2)
    assert @bf.ends_with('a😀b', '😀', 3)
    refute @bf.ends_with('a😀b', 'a', 2)
  end
end
