# frozen_string_literal: true

require 'minitest/autorun'
require 'barefoot_js'

# Minimal backend, mirroring helper_vectors_test.rb's PureBackend.
class FormatDatePureBackend
  def encode_json(data) = data.to_s
  def mark_raw(str) = str
  def materialize(value) = value
  def render_named(*) = ''
end

# #2344: `format_date` resolves canonical IANA zone names through tzdata
# (tzinfo) and RAISES on anything unresolvable — the loud-not-silent
# replacement for the pre-#2344 normalize-to-UTC total function. The
# resolvable grid is pinned by the golden vectors (helper_vectors_test.rb);
# this suite pins the error side, which is outside the vector domain
# (spec/template-helpers.md JS-throws rule).
class FormatDateTest < Minitest::Test
  BF = BarefootJS::Context.new(FormatDatePureBackend.new)

  RECV = '2024-01-01T23:00:00.000Z'

  def test_unresolvable_time_zones_raise
    ['garbage', 'Asia/Tokyoo', '+9:00', '+25:00', 'asia/tokyo', 'Local', ''].each do |tz|
      assert_raises(ArgumentError, "tz=#{tz.inspect}") do
        BF.format_date(RECV, 'YYYY-MM-DD', tz)
      end
    end
  end

  def test_receiver_contract_precedes_tz_validation
    # nil / unparseable receivers render '' without inspecting tz.
    assert_equal '', BF.format_date(nil, 'YYYY-MM-DD', 'garbage')
    assert_equal '', BF.format_date('not a date', 'YYYY-MM-DD', 'garbage')
  end

  def test_named_zone_happy_path
    # Redundant with the golden vectors, but keeps this file
    # self-sufficient outside the monorepo checkout.
    assert_equal '2024-01-02', BF.format_date(RECV, 'YYYY-MM-DD', 'Asia/Tokyo')
  end
end
