package BarefootJS::Backend::Xslate;
use strict;
use warnings;
use utf8;
use feature 'signatures';
no warnings 'experimental::signatures';

use Text::Xslate ();
use JSON::PP ();

# ---------------------------------------------------------------------------
# Text::Xslate (Kolon) rendering backend for the BarefootJS runtime.
# ---------------------------------------------------------------------------
#
# The engine-agnostic runtime logic — the JS-compat value helpers, array/string
# methods, hydration markers, child rendering — lives in BarefootJS
# (@barefootjs/perl). This backend supplies the four engine-specific operations
# the runtime delegates to, targeting Text::Xslate's Kolon syntax:
#
#   encode_json($data)            -> JSON string (injectable encoder)
#   mark_raw($str)                -> Text::Xslate raw value (no re-escaping)
#   materialize($value)           -> resolve a captured-children value to a string
#   render_named($name, $bf, \%v) -> render `<name>.tx` with `bf` + vars bound
#
# Pair it with the @barefootjs/xslate compile-time adapter, which emits Kolon
# `.tx` templates that call the runtime as a `$bf` object: `<: $bf.scope_attr()
# :>`, `<: $bf.json($x) :>`, `<: $bf.spread_attrs($bag) :>`. Kolon auto-escapes
# `<: ... :>` interpolations (`type => 'html'`); helpers that emit markup return
# `mark_raw` values (or the template adds `| mark_raw`), mirroring Mojo EP's
# `<%==` vs `<%=` distinction.
#
# Unlike the Mojo backend, this has no dependency on a web framework: a plain
# Text::Xslate instance renders templates from a path, so it runs under any
# PSGI / Plack app (or none at all).

sub new ($class, %args) {
    my $json_encoder = $args{json_encoder} // do {
        # Default pure-Perl encoder. `canonical` keeps key order deterministic
        # (matching the runtime's sorted-key SSR policy); `allow_nonref` lets
        # scalars / undef encode as `"x"` / `null`. Swap via `json_encoder`
        # for a faster XS implementation.
        my $j = JSON::PP->new->canonical->allow_nonref;
        sub ($data) { return $j->encode($data) };
    };

    # Accept a pre-built Text::Xslate instance, or build one from `path`
    # (a dir of `.tx` templates) plus any extra `xslate_options`.
    my $xslate = $args{xslate};
    unless ($xslate) {
        $xslate = Text::Xslate->new(
            syntax => 'Kolon',
            type   => 'html',
            ($args{path} ? (path => $args{path}) : ()),
            %{ $args{xslate_options} // {} },
        );
    }

    return bless { xslate => $xslate, json_encoder => $json_encoder }, $class;
}

sub xslate ($self) { return $self->{xslate} }

sub encode_json ($self, $data) {
    return $self->{json_encoder}->($data);
}

# Mark a string as already-safe so Kolon emits it verbatim (no auto-escape).
sub mark_raw ($self, $str) {
    return Text::Xslate::mark_raw($str);
}

# JSX children captured by the adapter (a Kolon macro call yields a rendered
# string; some paths may pass a CODE ref) resolve to a string here.
sub materialize ($self, $value) {
    return ref($value) eq 'CODE' ? $value->() : $value;
}

# Render `<name>.tx` with `$child_bf` bound as the `bf` object for the nested
# render, plus the supplied template vars. No stash juggling is needed: Kolon
# resolves `$bf` from the per-render vars, so each child render gets its own
# instance directly.
sub render_named ($self, $template_name, $child_bf, $vars) {
    return $self->{xslate}->render("$template_name.tx", { %$vars, bf => $child_bf });
}

1;
