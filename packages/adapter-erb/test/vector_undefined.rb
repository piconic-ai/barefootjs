# frozen_string_literal: true

require 'barefoot_js/undefined'

# JS `undefined` in the golden vectors (spec/js-undefined-value.md, "JSON
# encoding for vectors"): the one-key `{"$undef": true}` sentinel, shared by
# the primitive, helper and eval vector harnesses.
#
# - in `args` and the evaluator `env` the sentinel decodes to ARG, the
#   runtime's undefined (`BarefootJS::UNDEF`);
# - in an `expect` it matches only a value `runtime_undefined?` accepts, also
#   inside nested arrays and hashes. A host `nil` is JS `null` and never
#   matches it.
module VectorUndefined
  ARG = BarefootJS::UNDEF

  # Whether `got` is the runtime's own undefined value.
  def self.runtime_undefined?(got)
    BarefootJS.undefined?(got)
  end

  # Whether a JSON-decoded value (symbol or string keys) is `{"$undef": true}`.
  def self.sentinel?(value)
    BarefootJS.undefined_sentinel?(value)
  end

  # Replaces every `$undef` in an `args` / `env` value with ARG: the
  # runtime's own manifest decoder.
  def self.to_arg(value)
    BarefootJS.decode_undefined(value)
  end
end
