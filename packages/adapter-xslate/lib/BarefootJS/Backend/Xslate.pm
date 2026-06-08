package BarefootJS::Backend::Xslate;
our $VERSION = "0.10.0";
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
    # (a dir of `.tx` templates) plus any extra `xslate_options`. The adapter
    # calls every runtime helper as a `$bf` method (`$bf.filter`, `$bf.lc`, …)
    # or a Kolon builtin (`.join`, `.size`), so no custom `function` map is
    # needed here — a plain Kolon, html-escaping instance suffices.
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
__END__

=encoding utf8

=head1 NAME

BarefootJS::Backend::Xslate - Text::Xslate (Kolon) rendering backend for BarefootJS

=head1 SYNOPSIS

    use BarefootJS;
    use BarefootJS::Backend::Xslate;

    my $backend = BarefootJS::Backend::Xslate->new(path => ['templates']);
    my $bf = BarefootJS->new(undef, { backend => $backend });

    # Renders templates/counter.tx, binding the runtime as the `bf` object.
    my $html = $backend->render_named('counter', $bf, { count => 0 });

=head1 DESCRIPTION

A rendering backend that lets the engine-agnostic L<BarefootJS> runtime render
its marked templates with L<Text::Xslate> (Kolon syntax). Because it has no
dependency on a web framework, a plain Text::Xslate instance renders templates
from a path, so it runs under any PSGI / Plack application (or none at all).

Pair it with the C<@barefootjs/xslate> compile-time adapter, which emits Kolon
C<.tx> templates that call the runtime as a C<bf> object — C<< <: $bf.scope_attr()
:> >>, C<< <: $bf.json($x) :> >>, C<< <: $bf.spread_attrs($h) :> >>. Kolon
auto-escapes C<< <: ... :> >> interpolations (the backend builds Text::Xslate
with C<< type => 'html' >>); helpers that emit markup return C<mark_raw> values,
mirroring Mojo EP's C<< <%== >> versus C<< <%= >>.

=head1 METHODS

=head2 new(%args)

Constructs a backend. Accepts a pre-built C<xslate> instance, or a C<path>
(arrayref of template directories) plus optional C<xslate_options> to build a
Kolon, html-escaping Text::Xslate. C<json_encoder> overrides the default
canonical L<JSON::PP> encoder.

No custom Kolon C<function> map is needed: the C<@barefootjs/xslate> adapter
calls every runtime helper as a C<$bf> method (C<< $bf.filter($arr, -> $x {
... }) >>, C<< $bf.lc($s) >>, …) or a Kolon builtin (C<< $arr.join(", ") >>,
C<< $arr.size() >>), so a plain instance renders the emitted templates.

=head2 encode_json($data) / mark_raw($str) / materialize($value) / render_named($name, $bf, \%vars)

The four engine-specific operations the runtime delegates to. C<mark_raw> uses
C<Text::Xslate::mark_raw>; C<render_named> renders C<< <name>.tx >> with C<$bf>
bound as the C<bf> variable plus C<\%vars>.

=head1 SEE ALSO

L<BarefootJS>, L<Text::Xslate>, L<Plack>,
L<https://github.com/piconic-ai/barefootjs>

=head1 AUTHOR

kobaken E<lt>kentafly88@gmail.comE<gt>

=head1 LICENSE

Copyright (c) 2025-present BarefootJS Contributors.

This library is free software; you can redistribute it and/or modify it under
the MIT License. See the F<LICENSE> file in the distribution for the full text.

=cut
