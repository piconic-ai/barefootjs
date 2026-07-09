# frozen_string_literal: true
# Probe runner (Ruby / ERB evaluator). Reads $PROBE_VECTORS, evaluates each
# case, and prints a classified line per divergence. Not a committed vector
# test — see ../README.md.
require 'json'
require 'barefoot_js/evaluator'

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
  return false if got.is_a?(Numeric) != expect.is_a?(Numeric)
  return got == expect if got.is_a?(Numeric)
  return false unless got.is_a?(String) && expect.is_a?(String)
  got == expect
end

cases = JSON.parse(File.read(ENV['PROBE_VECTORS'], encoding: Encoding::UTF_8), symbolize_names: true)[:cases]
cases.each do |c|
  begin
    got = BarefootJS::Evaluator.evaluate(c[:expr], c[:env] || {})
    unless value_match?(got, c[:expect])
      kind = c[:known] ? 'KNOWN' : 'NEW'
      puts "#{kind}\t#{c[:category]}\t#{c[:note]}\t#{got.inspect}\t#{c[:expect].inspect}"
    end
  rescue => e
    puts "ERROR\t#{c[:category]}\t#{c[:note]}\t#{e.class}: #{e.message}"
  end
end
puts "RAN\t#{cases.length}"
