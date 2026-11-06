# frozen_string_literal: true

require 'minitest/autorun'
require 'tmpdir'
require 'barefoot_js'
require 'barefoot_js/backend/erb'

# Regression coverage for #2157: `derive_vars_from_defaults` looked up caller
# props with `props.key?(prop_name)` where `prop_name = d[:propName]` is a
# String straight out of the JSON manifest (`JSON.parse(json,
# symbolize_names: true)` symbolizes HASH KEYS only, never string VALUES),
# while every runtime prop hash is symbol-keyed (compiled templates pass
# `{ children: ... }` literals; `register_components_from_manifest` builds
# its `props` the same way). `props.key?("children")` against a
# `{ children: ... }`-shaped hash is therefore always false, so every
# manifest-registered child component silently fell back to its static
# default -- e.g. a `<Button>` slot's `children` rendering empty.
class DeriveVarsFromDefaultsTest < Minitest::Test
  # ---------------------------------------------------------------------
  # Unit: derive_vars_from_defaults directly
  # ---------------------------------------------------------------------

  # The issue's minimal proof: a defaults entry shaped exactly like a
  # manifest-parsed `ssrDefaults` value (String `propName`, symbol keys on
  # the entry hash itself) must still resolve against a symbol-keyed props
  # hash. This is RED without the `&.to_sym` fix.
  def test_string_prop_name_resolves_against_symbol_keyed_props
    defaults = { children: { propName: 'children', value: nil } }
    props = { children: '+1' }

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal '+1', extra[:children]
  end

  # A destructure default applies to an absent or `undefined` prop only: an
  # explicit `nil` is JS `null` and keeps `null` (spec/js-undefined-value.md,
  # decision 6).
  def test_caller_prop_present_but_nil_keeps_null
    defaults = { label: { propName: 'label', value: 'Static' } }
    props = { label: nil }

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert extra.key?(:label)
    assert BarefootJS.null?(extra[:label])
  end

  def test_caller_prop_present_but_undefined_falls_back_to_default_value
    defaults = { label: { propName: 'label', value: 'Static' } }
    props = { label: BarefootJS::UNDEF }

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal 'Static', extra[:label]
  end

  def test_prop_name_present_but_props_missing_key_falls_back_to_default_value
    defaults = { label: { propName: 'label', value: 'Static' } }
    props = {}

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal 'Static', extra[:label]
  end

  def test_entry_without_prop_name_always_uses_static_value
    # signal / memo locals have no caller-supplied prop to read at all --
    # the manifest entry omits `propName` and the static value always wins,
    # even when `props` happens to hold a same-named key.
    defaults = { count: { value: 0 } }
    props = { count: 999 }

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal 0, extra[:count]
  end

  def test_non_hash_entry_is_used_as_a_raw_static_value
    defaults = { flag: true }
    props = { flag: false }

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal true, extra[:flag]
  end

  def test_rest_props_entry_passes_through_the_callers_bag
    defaults = { rest: { isRestProps: true, value: {} } }
    props = { rest: { data_foo: 'bar' } }

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal({ data_foo: 'bar' }, extra[:rest])
  end

  def test_rest_props_entry_falls_back_to_static_value_when_absent
    defaults = { rest: { isRestProps: true, value: {} } }
    props = {}

    extra = BarefootJS::Context.send(:derive_vars_from_defaults, defaults, props)

    assert_equal({}, extra[:rest])
  end

  # `extractSsrDefaults` writes no `value` for a prop without a default
  # (spec/js-undefined-value.md, rollout step U1): an absent or `UNDEF` prop
  # then seeds `UNDEF`, and its key is still set; a present prop, `nil`
  # included, keeps its value.
  def test_entry_without_value_seeds_undefined
    missing = { n: { propName: 'n' }, rest: { isRestProps: true } }
    [{}, { n: BarefootJS::UNDEF }].each do |props|
      extra = BarefootJS::Context.send(:derive_vars_from_defaults, missing, props)
      assert_equal %i[n rest], extra.keys
      assert BarefootJS.undefined?(extra[:n])
      assert BarefootJS.undefined?(extra[:rest])
    end
    assert BarefootJS.null?(BarefootJS::Context.send(:derive_vars_from_defaults, missing, { n: nil })[:n])
    assert_equal 3, BarefootJS::Context.send(:derive_vars_from_defaults, missing, { n: 3 })[:n]
    assert_equal({ a: 1 }, BarefootJS::Context.send(:derive_vars_from_defaults, missing, { rest: { a: 1 } })[:rest])
  end

  # ---------------------------------------------------------------------
  # End-to-end: register_components_from_manifest + real ERB rendering
  # ---------------------------------------------------------------------
  #
  # Reproduces the reported symptom directly: a manifest-registered child
  # component (`ui/button/index`) whose `ssrDefaults` maps `children` back
  # to the caller's `children` prop must render the CALLER's children, not
  # the static `nil` default.
  def test_manifest_registered_child_renders_caller_children_through_real_erb
    Dir.mktmpdir do |dir|
      # register_components_from_manifest strips the `templates/` prefix
      # and `.erb` suffix off `markedTemplate` before asking the backend to
      # load it, so the on-disk file sits directly under `dir` as
      # `button.erb` (see barefoot_js.rb:258).
      File.write(File.join(dir, 'button.erb'), '<%= v[:children] %>')

      backend = BarefootJS::Backend::Erb.new(path: dir)
      bf = BarefootJS::Context.new(backend)
      bf._scope_id('root')

      # Hand-built exactly as `JSON.parse(manifest_json, symbolize_names:
      # true)` would produce: entry-hash keys are symbols, but
      # `ssrDefaults`'s `propName` VALUE stays a String -- JSON has no
      # symbol type, and `symbolize_names` only affects hash keys.
      manifest = {
        :"ui/button/index" => {
          markedTemplate: 'templates/button.erb',
          ssrDefaults: {
            children: { propName: 'children', value: nil },
          },
        },
      }

      bf.register_components_from_manifest(manifest)

      html = bf.render_child('button', { _bf_slot: 's4', children: '+1' })

      assert_includes html, '+1'
    end
  end
end
