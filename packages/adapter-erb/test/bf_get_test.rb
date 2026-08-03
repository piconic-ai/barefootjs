# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# bf.get -- runtime-polymorphic element/key access for `arr[index]` /
# `hash[key]` (`emitIndexAccessRuby`, expr/operand.ts). Regression for
# #2491: a dynamic-key element access on a loop row (`tone[k]`) used to
# guess at compile time whether the index was a string key or a numeric
# index, and the guess broke when a row hash (symbolize_names: true, so
# Symbol-keyed) was accessed by a runtime String key. `get` dispatches on
# the receiver's runtime type instead of guessing.
class BfGetPureBackend
  def mark_raw(str)
    str
  end
end

class BfGetTest < Minitest::Test
  def setup
    @bf = BarefootJS::Context.new(BfGetPureBackend.new)
  end

  def test_hash_with_symbol_keys_and_string_lookup_key
    row = { id: 1, a: 'row1-a', b: 'row1-b' }
    assert_equal 'row1-a', @bf.get(row, 'a')
    assert_equal 1, @bf.get(row, 'id')
  end

  def test_hash_with_string_keys
    row = { 'id' => 1, 'a' => 'row1-a' }
    assert_equal 'row1-a', @bf.get(row, 'a')
    # A Symbol lookup key still resolves against a String-keyed Hash.
    assert_equal 'row1-a', @bf.get(row, :a)
  end

  def test_hash_missing_key_returns_nil
    row = { a: 'row1-a' }
    assert_nil @bf.get(row, 'missing')
  end

  def test_array_numeric_index
    arr = %w[row0 row1 row2]
    assert_equal 'row1', @bf.get(arr, 1)
    # A string-typed numeric index (the common loop-index emission
    # shape) resolves the same as a genuine Integer.
    assert_equal 'row2', @bf.get(arr, '2')
  end

  def test_array_out_of_range_returns_nil
    arr = %w[row0 row1]
    assert_nil @bf.get(arr, 5)
    assert_nil @bf.get(arr, -1)
  end

  def test_nil_collection_or_key_returns_nil
    assert_nil @bf.get(nil, 'a')
    assert_nil @bf.get({ a: 1 }, nil)
  end
end
