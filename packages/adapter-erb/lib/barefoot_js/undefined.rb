# frozen_string_literal: true

module BarefootJS
  # JS `undefined` (spec/js-undefined-value.md). Host `nil` is JS `null`; JS
  # `undefined` is one frozen singleton, `BarefootJS::UNDEF`, created only
  # where JS reads one: a missing key, an out-of-range index, `.at()` /
  # `.find()` with no result, `?.` over a nullish receiver, the `undefined`
  # identifier (`bf.undefined` in a template), an omitted declared prop. No
  # decoded data is walked to convert anything.
  #
  # Ruby cannot make an object falsy, so `UNDEF` is truthy under Ruby's own
  # `if` / `||` / `&&` / `unless`. Every JS truthiness test in a compiled
  # template and in this runtime goes through `Evaluator.truthy?`
  # (`bf.truthy?`), which reads it as falsy. `nil?` answers true, so a
  # native `x.nil?` in a template is the JS nullish test (`x == null`); the
  # runtime never relies on it and tests with `BarefootJS.undefined?` /
  # `null?` / `nullish?` instead. `&.` does not consult `nil?`: it calls
  # through on `UNDEF`, which is why a template spells `o?.k` as
  # `bf.get_opt(o, :k)`.
  #
  # It prints as `''` (`to_s`), as JS renders `undefined` in a text or
  # attribute position, and reading any key of it gives itself (`[]`), so a
  # chained read past it stays `undefined` instead of raising. `to_json`
  # gives `null` for a host encoder; the runtime's own JSON walk follows
  # `JSON.stringify` instead (a member holding it is dropped).
  class Undefined
    def nil?
      true
    end

    def to_s
      ''
    end

    def inspect
      'undefined'
    end

    def [](*)
      self
    end

    def to_json(*)
      'null'
    end

    # The singleton survives a copy (a host's `deep_dup`, `Marshal`-free
    # cloning), so identity tests keep holding.
    def dup
      self
    end

    def clone(*)
      self
    end
  end

  UNDEF = Undefined.new.freeze
  Undefined.private_class_method :new

  module_function

  # JS `v === undefined`.
  def undefined?(value)
    Undefined === value
  end

  # JS `v === null`: host `nil` (strictly: `UNDEF.nil?` is true too).
  def null?(value)
    NilClass === value
  end

  # JS `v == null`: `null` or `undefined`.
  def nullish?(value)
    NilClass === value || Undefined === value
  end

  # Whether a JSON-decoded value (symbol or string keys) is the
  # `{"$undef": true}` sentinel, the manifest's (and the golden vectors')
  # spelling of JS `undefined` (spec/js-undefined-value.md, "JSON encoding
  # for vectors").
  def undefined_sentinel?(value)
    value.is_a?(Hash) && value.size == 1 && (value[:$undef] == true || value['$undef'] == true)
  end

  # `value` with every sentinel, at any depth, replaced by `UNDEF`; inside a
  # hash it is a present key holding `undefined`. Every other hash key that
  # begins with `$$` loses one leading `$`: the manifest encoder escapes a
  # seed's own `$`-prefixed keys that way, so data shaped like the sentinel
  # stays data.
  def decode_undefined(value)
    return UNDEF if undefined_sentinel?(value)
    return value.map { |v| decode_undefined(v) } if value.is_a?(Array)
    return value.to_h { |k, v| [unescape_key(k), decode_undefined(v)] } if value.is_a?(Hash)

    value
  end

  # A `$$`-prefixed key (symbol or string) with one leading `$` removed.
  def unescape_key(key)
    name = key.to_s
    return key unless name.start_with?('$$')

    key.is_a?(Symbol) ? name[1..].to_sym : name[1..]
  end
end
