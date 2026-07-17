package BarefootJS::Backend::Mojo;
our $VERSION = "0.21.3";
use Mojo::Base -base, -signatures;

use Mojo::ByteStream qw(b);
use Mojo::JSON qw(to_json);
use Scalar::Util qw(weaken);

# ---------------------------------------------------------------------------
# Reference rendering backend (Mojolicious / Mojo::Template).
# ---------------------------------------------------------------------------
#
# BarefootJS.pm holds all the template-engine-agnostic logic (the JS-compat
# value helpers, array/string methods, hydration markers). Everything that is
# specific to *how a template is rendered* — JSON marshalling, raw-string
# marking, JSX-children materialisation, and named-template rendering — lives
# behind this backend object so the same runtime can drive a different Perl
# template engine (Text::Xslate, Template Toolkit, …) without rewriting the
# helper surface.
#
# A backend MUST implement:
#   - encode_json($data)            -> string
#   - mark_raw($str)                -> value the engine emits without escaping
#   - materialize($value)           -> string (resolve a captured-children ref)
#   - render_named($name, $bf, \%vars) -> string
#
# This Mojo implementation is the reference. To target another engine, write a
# sibling backend (BarefootJS::Backend::Xslate, …) implementing the same four
# methods and pass it via `BarefootJS->new($c, { backend => $b })`.

# The Mojolicious controller. Optional: the value-marshalling helpers
# (`encode_json` / `mark_raw` / `materialize`) work without it; only
# `render_named` reaches into the controller's renderer + stash.
has 'c';

# Pluggable JSON encoder (#engine-abstraction). Defaults to
# `Mojo::JSON::to_json`, which returns a *character* string (not bytes)
# suitable for embedding in HTML output via `<%==` / Mojo::ByteStream.
#
# Override with any `sub ($data) { ... }` to swap in a faster XS encoder —
# e.g. `json_encoder => sub { Cpanel::JSON::XS->new->canonical->encode($_[0]) }`.
# The pure-Perl JSON::PP fallback Mojo::JSON uses can be a hot spot for large
# props payloads; the seam lets a host pick its own implementation without
# touching the runtime.
has 'json_encoder' => sub { \&to_json };

# Hold the controller weakly for the same reason BarefootJS does: the
# controller owns the bf instance (which owns this backend) via its stash,
# so a strong back-reference would close a per-request cycle the refcount GC
# can't reclaim. `render_named` only touches `$self->c` mid-render, while the
# controller is still alive on the request stack.
sub new ($class, %args) {
    my $self = $class->SUPER::new(%args);
    weaken($self->{c}) if $self->{c};
    return $self;
}

sub encode_json ($self, $data) {
    return $self->json_encoder->($data);
}

# Mark a string as already-safe so the template engine emits it verbatim
# (no re-escaping). In Mojo this is a Mojo::ByteStream, which the calling
# template's `<%==` raw-emit passes through unescaped.
sub mark_raw ($self, $str) {
    return b($str);
}

# JSX children / async fallbacks arrive via Mojo's `begin %>...<% end`
# capture, which produces a CODE ref returning a Mojo::ByteStream. Resolve
# it to a string before embedding. Plain (already-rendered) strings pass
# through unchanged.
sub materialize ($self, $value) {
    return ref($value) eq 'CODE' ? $value->() : $value;
}

# Render a named template with `$child_bf` bound as the active runtime
# instance for that render. The Mojo `bf` helper resolves the current
# instance off `$c->stash->{'bf.instance'}`; swap it for the duration of
# the nested render and restore it afterwards so sibling renders are
# unaffected. `local` (rather than a manual swap) keeps the restore
# exception-safe: a die inside the nested render — e.g. a grandchild with
# no registered renderer — propagates without leaving the child instance
# bound as the request's active one.
sub render_named ($self, $template_name, $child_bf, $vars) {
    my $c = $self->c;
    local $c->stash->{'bf.instance'} = $child_bf;
    my $html = $c->render_to_string(template => $template_name, %$vars);
    # `render_to_string` returns undef — it does NOT die — when the named
    # template can't be rendered (typically: the template file is missing
    # from the renderer paths). The calling template's `<%==` would emit
    # that as an empty string, silently dropping the whole child subtree
    # from the page (#2132). Fail the render loudly instead.
    die qq{BarefootJS: child template "$template_name" rendered no output }
      . qq{(is the template missing from the renderer paths?)\n}
        unless defined $html;
    return $html;
}

1;
