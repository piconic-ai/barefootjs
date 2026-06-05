use Test2::V0;

# spread_attrs — JSX intrinsic-element spread runtime helper (#1407
# follow-up). Mirrors the JS `spreadAttrs` in
# packages/client/src/runtime/spread-attrs.ts and the Go adapter's
# `bf.SpreadAttrs` so SSR output stays byte-equal across the three
# adapters. Cross-adapter parity regressions surface here first.

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# Boolean sentinels via core JSON::PP (not Mojo::JSON) so this engine-agnostic
# test runs with zero Mojo present. `spread_attrs` recognises the
# JSON::PP::Boolean ref the same way it recognises Mojo::JSON's sentinel.
use JSON::PP ();
sub true  { JSON::PP::true }
sub false { JSON::PP::false }

# Minimal pure-Perl backend: `spread_attrs` only reaches the backend for
# `mark_raw` (raw-string marking), which is the identity here.
{
    package PureBackend;
    sub new      { bless {}, shift }
    sub mark_raw { $_[1] }
}

# The runtime spread helper is a pure function of $self + bag; a bare blessed
# hash with an injected pure backend is sufficient.
my $bf = bless { c => undef, config => {}, backend => PureBackend->new }, 'BarefootJS';

# spread_attrs returns Mojo::ByteStream so callers can `<%==` it
# without re-escaping. Stringify here for assertion convenience.
sub run { return "" . $bf->spread_attrs(@_) }

subtest 'basic shapes' => sub {
    is run(undef),       '', 'undef bag → empty';
    is run({}),          '', 'empty bag → empty';
    is run('not a hash'), '', 'non-hash scalar → empty';
    is run({id => 'a'}), 'id="a"', 'single string';
};

subtest 'alphabetic key order (deterministic SSR)' => sub {
    is run({id => 'a', class => 'on'}),
       'class="on" id="a"',
       'sorted by key name';
};

subtest 'key remapping' => sub {
    is run({className => 'foo'}), 'class="foo"',  'className → class';
    is run({htmlFor   => 'x'}),   'for="x"',      'htmlFor → for';
    is run({dataPriority => 'high'}),
       'data-priority="high"',
       'camelCase → kebab-case';
    # SVG XML attrs are case-sensitive — preserve verbatim.
    is run({viewBox => '0 0 10 10'}),
       'viewBox="0 0 10 10"',
       'SVG viewBox preserved';
    is run({clipPathUnits => 'userSpaceOnUse'}),
       'clipPathUnits="userSpaceOnUse"',
       'SVG clipPathUnits preserved';
    # JS-reference parity (#1411): a leading uppercase letter
    # emits a leading dash. The resulting HTML attribute name is
    # invalid in both the JS and Perl/Go runtimes, but the byte-
    # equal output across the three adapters matters more.
    is run({XData => 'x'}),
       '-x-data="x"',
       'leading-uppercase emits leading dash (JS-reference parity)';
};

subtest 'event handlers — JS predicate parity' => sub {
    # JS: `key.startsWith('on') && key.length > 2 && key[2] === key[2].toUpperCase()`.
    is run({onClick => 'fn', id => 'a'}), 'id="a"',
       'onClick skipped (uppercase third char)';
    is run({on_custom => 'fn', id => 'a'}), 'id="a"',
       'on_custom skipped (underscore third char)';
    is run({on0 => 'fn', id => 'a'}), 'id="a"',
       'on0 skipped (digit third char)';
    is run({oncology => 'x'}), 'oncology="x"',
       'on + lowercase letter NOT treated as event';
};

subtest 'children skipped, ref passed through (JS-reference parity)' => sub {
    is run({children => 'x', id => 'a'}), 'id="a"',
       'children skipped';
    # JS `spreadAttrs` does NOT filter `ref` (`applyRestAttrs` does
    # — that's a separate divergence). Match the JS reference so
    # SSR stays byte-equal with Hono / Go.
    is run({ref => 'x', id => 'a'}), 'id="a" ref="x"',
       'ref passes through';
};

subtest 'boolean values via Mojo::JSON sentinels' => sub {
    # The contract: callers MUST use Mojo::JSON::true/false for
    # booleans. Plain scalar 0/1 render as numeric values.
    is run({hidden => true, id => 'a'}),
       'hidden id="a"',
       'true → bare attribute';
    is run({hidden => false, id => 'a'}),
       'id="a"',
       'false → omitted';
    # Plain numeric 0 renders as a value (matches HTML
    # `tabindex="0"` use case).
    is run({tabindex => 0}),
       'tabindex="0"',
       'plain scalar 0 → numeric attribute value';
};

subtest 'nullish skip' => sub {
    is run({a => undef, b => 'x'}),
       'b="x"',
       'undef value omitted';
};

subtest 'HTML escape' => sub {
    is run({title => '<b>"x"</b>'}),
       'title="&lt;b&gt;&#34;x&#34;&lt;/b&gt;"',
       'angle brackets and quotes escaped';
    is run({alt => "tom & jerry"}),
       'alt="tom &amp; jerry"',
       'ampersand escaped';
};

subtest 'style object lowering' => sub {
    is run({style => {backgroundColor => 'red', color => 'white'}}),
       'style="background-color:red;color:white"',
       'style hashref → CSS string';
    is run({style => 'color:red'}),
       'style="color:red"',
       'style scalar passthrough';
};

done_testing;
