# frozen_string_literal: true

require 'json'

# JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
# encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
# the primitive, helper and eval vector harnesses.
#
# The Ruby runtime has no undefined value yet (rollout step U4 adds it), so
# for now:
#
# - in `args` and the evaluator `env` the sentinel decodes to ARG, the host
#   nil a template receives for `undefined` today;
# - in an `expect` it matches only a value `runtime_undefined?` accepts. None
#   exists yet, so it never matches, also inside nested arrays and hashes, and
#   every such case is listed in an expected-failure ledger or pinned as a
#   divergence.
#
# U4 flips both here: ARG becomes the runtime's undefined and
# `runtime_undefined?` recognizes it.
module VectorUndefined
  ARG = nil

  # Whether `got` is the runtime's own undefined value (none yet: U4).
  def self.runtime_undefined?(_got)
    false
  end

  # Whether a JSON-decoded value (symbol or string keys) is `{"$undef": true}`.
  def self.sentinel?(value)
    value.is_a?(Hash) && value.size == 1 && (value[:$undef] == true || value['$undef'] == true)
  end

  # Replaces every `$undef` in an `args` / `env` value with ARG.
  def self.to_arg(value)
    return ARG if sentinel?(value)
    return value.map { |v| to_arg(v) } if value.is_a?(Array)
    return value.transform_values { |v| to_arg(v) } if value.is_a?(Hash)

    value
  end

  # The "ruby" runtime of an expected-failure ledger: case key => entry.
  def self.load_expected_failures(path)
    JSON.parse(File.read(path, encoding: Encoding::UTF_8))['runtimes'].fetch('ruby')
  end
end
