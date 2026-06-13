package BarefootJS;
our $VERSION = "0.14.0";
use strict;
use warnings;
use utf8;
use feature 'signatures';
no warnings 'experimental::signatures';

use POSIX ();
use Scalar::Util qw(looks_like_number weaken);

# NOTE: This runtime is template-engine-agnostic AND framework-agnostic by
# design, so it can ship as a standalone CPAN distribution. It depends only on
# core Perl (subroutine signatures + the hand-rolled minimal accessor base
# below — no Mojo::Base, no Class::Tiny). Every operation that depends on *how*
# a template is rendered — JSON marshalling, raw-string marking, JSX-children
# materialisation, and named-template rendering — is delegated to a pluggable
# `backend` (see BarefootJS::Backend::Mojo for the reference Mojolicious
# implementation), which is the only component that pulls in the Mojo
# distribution, and only when it is actually used.

# ---------------------------------------------------------------------------
# Minimal accessor base (no Mojo::Base / Class::Tiny dependency)
# ---------------------------------------------------------------------------
#
# Generates read/write accessors with optional lazy defaults so the runtime
# stays free of any non-core OO base. Semantics mirror the Mojo::Base `has`
# this class used to inherit: a getter returns the stored value (building it
# from the default on first access if unset); a setter stores the value and
# returns $self for chaining. A default is either a plain scalar or a coderef
# invoked as `$default->($self)` (for per-instance refs like `[]` / `{}` and
# the lazily-required Mojo backend).
my %ATTR_DEFAULT = (
    _scripts         => sub { [] },
    _script_seen     => sub { {} },
    _child_renderers => sub { {} },
    _is_child        => 0,
    # Lazily fall back to the Mojo reference backend so a bare-blessed
    # instance (the pure-function unit tests) and the historical
    # `BarefootJS->new($c, ...)` callers keep working unchanged. A non-Mojo
    # host injects its own backend via `BarefootJS->new($c, { backend => $b })`
    # and never triggers this require — keeping the core load Mojo-free.
    backend          => sub {
        require BarefootJS::Backend::Mojo;
        return BarefootJS::Backend::Mojo->new;
    },
);

# c            — Mojolicious controller (kept for back-compat accessors)
# config       — plugin / instance config
# backend      — the template-engine seam (#engine-abstraction)
# _scope_id    — addressable scope id
# _bf_parent / _bf_mount — slot identity when this scope is slot-attached
# _props       — props serialised into bf-p / the scope comment
# _data_key    — keyed-loop-item key, emitted as data-key on the scope root
for my $attr (qw(
    c config backend
    _scripts _script_seen _scope_id _is_child _bf_parent _bf_mount _props
    _data_key _child_renderers
)) {
    no strict 'refs';
    *{"BarefootJS::$attr"} = sub {
        my $self = shift;
        if (@_) { $self->{$attr} = shift; return $self; }
        if (!exists $self->{$attr} && exists $ATTR_DEFAULT{$attr}) {
            my $d = $ATTR_DEFAULT{$attr};
            $self->{$attr} = ref($d) eq 'CODE' ? $d->($self) : $d;
        }
        return $self->{$attr};
    };
}

sub new ($class, $c, $config = {}) {
    # Build (or accept an injected) rendering backend. The default Mojo
    # backend wraps the controller and honours an optional `json_encoder`
    # override so a host can swap in a faster XS JSON implementation
    # without subclassing. A caller targeting another template engine
    # passes its own backend via `$config->{backend}`.
    my $backend = $config->{backend};
    unless ($backend) {
        require BarefootJS::Backend::Mojo;
        $backend = BarefootJS::Backend::Mojo->new(
            c => $c,
            ($config->{json_encoder}
                ? (json_encoder => $config->{json_encoder})
                : ()),
        );
    }
    my $self = bless {
        c       => $c,
        config  => $config,
        backend => $backend,
    }, $class;
    # Hold the controller weakly. Mojolicious stashes this bf instance under
    # `$c->stash->{'bf.instance'}`, so a strong bf -> controller back-reference
    # closes a per-request cycle ($c -> stash -> bf -> $c) that Perl's
    # refcount GC cannot reclaim, leaking one controller + bf + child-renderer
    # closures per request. The controller owns (outlives) the per-request bf,
    # so the weak ref stays valid for the whole render. Callers that need the
    # controller to outlive the bf instance independently must keep their own
    # strong reference (the normal Mojo request scope already does).
    weaken($self->{c}) if defined $c;
    return $self;
}

# ---------------------------------------------------------------------------
# Scope & Props
# ---------------------------------------------------------------------------

sub scope_attr ($self) {
    # bf-s is the addressable scope id only (#1249).
    return $self->_scope_id // '';
}

# Emits `bf-h="<host>" bf-m="<slot>" bf-r=""` conditionally.
# See spec/compiler.md "Slot identity".
sub hydration_attrs ($self) {
    my @parts;
    my $host  = $self->_bf_parent;
    my $mount = $self->_bf_mount;
    if (defined $host && length $host) {
        my $h = $host =~ s/"/&quot;/gr;
        push @parts, qq{bf-h="$h"};
    }
    if (defined $mount && length $mount) {
        my $m = $mount =~ s/"/&quot;/gr;
        push @parts, qq{bf-m="$m"};
    }
    unless ($self->_is_child) {
        push @parts, q{bf-r=""};
    }
    return join(' ', @parts);
}

# Emits ` data-key="<key>"` for a keyed loop item, else ''. The client
# runtime uses data-key for list reconciliation; SSR must match the Hono
# reference, which stamps it on each loop item's scope root. The value is set
# on the child instance by the child renderer (`register_child_renderer` /
# `register_components_from_manifest`) from the JSX `key` prop — a reserved
# prop, never a real template variable.
sub data_key_attr ($self) {
    my $k = $self->_data_key;
    return '' unless defined $k;
    $k =~ s/&/&amp;/g;
    $k =~ s/"/&quot;/g;
    return qq{ data-key="$k"};
}

sub props_attr ($self) {
    my $props = $self->_props;
    return '' unless $props && %$props;
    # encode_json returns a character string (not bytes) for safe embedding
    # in templates (the Mojo backend uses Mojo::JSON::to_json).
    my $json = $self->backend->encode_json($props);
    return qq{ bf-p='$json'};
}

# ---------------------------------------------------------------------------
# Context (SSR mirror of the client `provideContext` / `useContext`)
# ---------------------------------------------------------------------------
#
# A `<Ctx.Provider value>` seeds a value that descendant `useContext(Ctx)`
# consumers read during the same render. Dynamic scoping mirrors the client:
# the provider pushes the value before rendering its children and pops it
# after, and `use_context` reads the innermost active value (or the
# `createContext` default when none is active).
#
# The value stacks live in a package-level store rather than per-instance or
# on `$c->stash`: a parent template and the child templates it renders via
# `render_child` are separate bf instances that don't reliably share a
# controller (the Xslate backend runs with `c => undef`) nor a backend (the
# Mojo path lazily builds one per instance). SSR rendering is synchronous —
# nothing awaits between a provider's push and its matching pop — and the
# push/pop are perfectly balanced, so the per-name stack always unwinds to
# empty at the end of each provider subtree, keeping concurrent root renders
# isolated. provide/revoke return '' so they drop cleanly into an inline
# `<: … :>` (Kolon) or `% … ;` (EP) emit.

my %CONTEXT_STACKS;

sub provide_context ($self, $name, $value) {
    push @{ $CONTEXT_STACKS{$name} //= [] }, $value;
    return '';
}

sub revoke_context ($self, $name) {
    pop @{ $CONTEXT_STACKS{$name} } if $CONTEXT_STACKS{$name} && @{ $CONTEXT_STACKS{$name} };
    return '';
}

sub use_context ($self, $name, $default = undef) {
    my $stack = $CONTEXT_STACKS{$name};
    return $default unless $stack && @$stack;
    return $stack->[-1];
}

# ---------------------------------------------------------------------------
# Comment Markers
# ---------------------------------------------------------------------------

sub comment ($self, $text) {
    return "<!--bf-$text-->";
}

# ---------------------------------------------------------------------------
# JS-equivalent value stringification
# ---------------------------------------------------------------------------

# Map a Perl boolean-shaped value to the JS `String(bool)` form.
# Used by the Mojo adapter when emitting reactive attribute bindings
# whose JS source `isBooleanResultExpr` classified as boolean —
# a comparison (`count() > 0`), a logical negation (`!ok()`), or a
# literal `true` / `false`. Perl's auto-stringification of those
# expressions yields `''` / `1`; Hono and Go emit `'false'` / `'true'`.
# Centralising the bool → string mapping here keeps the contract
# testable and the template-emit syntax tidy
# (`<%= bf->bool_str(...) %>` vs an inline ternary).
#
# Contract is boolean-only: callers must have classified the
# expression as boolean-result before routing through this helper.
# Non-boolean values reaching here will be Perl-truthy-coerced to
# 'true' / 'false', which is generally wrong — non-boolean attribute
# bindings stay on the plain `<%= expr %>` emit path and never reach
# this function.
sub bool_str ($self, $value) {
    return $value ? 'true' : 'false';
}

sub text_start ($self, $slot_id) {
    return "<!--bf:$slot_id-->";
}

sub text_end ($self) {
    return "<!--/-->";
}

# See spec/compiler.md "Slot identity" for the comment-scope wire format.
sub scope_comment ($self) {
    my $scope_id = $self->_scope_id // '';
    my $host_segment = '';
    my $host  = $self->_bf_parent;
    my $mount = $self->_bf_mount;
    if (defined $host && length $host) {
        $host_segment = "|h=$host|m=" . ($mount // '');
    }
    my $props_json = '';
    if ($self->_props && %{$self->_props}) {
        $props_json = '|' . $self->backend->encode_json($self->_props);
    }
    return "<!--bf-scope:$scope_id$host_segment$props_json-->";
}

# ---------------------------------------------------------------------------
# Script Registration
# ---------------------------------------------------------------------------

sub register_script ($self, $path) {
    return if $self->_script_seen->{$path};
    $self->_script_seen->{$path} = 1;
    push @{$self->_scripts}, $path;
}

# ---------------------------------------------------------------------------
# Child Component Rendering
# ---------------------------------------------------------------------------
# (`_child_renderers` accessor is generated by the minimal accessor base above.)

# Register a renderer for `render_child($name, ...)`. The renderer is
# invoked as `$renderer->($props_hashref, $invoking_bf)` — unpack `@_`
# (`my ($props, $caller) = @_;`) instead of declaring a one-argument
# subroutine signature, which would enforce arity and die on the second
# argument.
sub register_child_renderer ($self, $name, $renderer) {
    $self->_child_renderers->{$name} = $renderer;
}

sub render_child ($self, $name, @args) {
    my $renderer = $self->_child_renderers->{$name};
    die "No renderer registered for child component '$name'" unless $renderer;
    # Accept both the Mojo list form — `bf->render_child($name, k => v, ...)`
    # — and the single-hashref form — `$bf.render_child($name, { k => v })`.
    # Template languages whose method calls can't splat a hash into positional
    # args (Text::Xslate Kolon, Template Toolkit) pass one hashref instead.
    my %props = (@args == 1 && ref $args[0] eq 'HASH') ? %{ $args[0] } : @args;
    # JSX children come in via the engine's children-capture mechanism
    # (Mojo's `begin %>...<% end`, which produces a CODE ref returning a
    # Mojo::ByteStream). Materialize it through the backend before handing
    # the props to the child renderer so the child template sees
    # `$children` as already-rendered HTML. Guard on `exists` so a
    # childless invocation (`bf->render_child('counter')`) doesn't gain a
    # spurious `children => undef` key — preserving the historical "only
    # touch children when present" behaviour.
    $props{children} = $self->backend->materialize($props{children})
        if exists $props{children};
    # Renderer contract (#1897): the renderer is invoked with TWO
    # arguments — the props hashref and the INVOKING instance. A renderer
    # registered on the root may be called from a nested child render
    # (AccordionTrigger -> ChevronDownIcon), and the grandchild's scope /
    # slot identity must chain off the CALLER's scope id, not the
    # registrant's. Renderers unpack `@_` (`my ($props, $caller) = @_;`)
    # rather than enforcing arity with a one-arg subroutine signature —
    # see `register_child_renderer`.
    return $renderer->(\%props, $self);
}

# ---------------------------------------------------------------------------
# Bulk registration from build manifest
# ---------------------------------------------------------------------------
#
# `bf build` emits dist/templates/manifest.json describing every
# component the page might invoke (Counter, ui/button/index, ...).
# This helper walks that manifest and registers one child renderer per
# UI registry entry — the path shape `ui/<name>/index` maps to the
# `<name>` slot key Counter.html.ep and friends use via
# `<%= bf->render_child('<name>', ...) %>`.
#
# Each manifest entry carries an `ssrDefaults` hash derived statically
# from the component's JSX (prop destructure defaults + signal /
# memo initial values, see packages/jsx/src/ssr-defaults.ts). The
# child renderer seeds every template variable from that hash,
# preferring the caller's matching prop where one exists. This
# replaces the per-component `signal_init` callback that every
# scaffold's `app.pl` used to hand-roll for items 1/3 of issue #1416.
#
# `signal_init` remains as an opt-in override for cases the static
# extractor can't see through (e.g. signal initial values that
# reference imported helpers). When supplied for a given slot key
# it takes precedence over the manifest's `ssrDefaults` for that
# child, allowing callers to mix manual overrides with auto-derived
# defaults for siblings.
sub register_components_from_manifest ($self, $manifest, %opts) {
    my $signal_inits = $opts{signal_init} // {};
    my $parent_scope = $self->_scope_id;
    # Weaken the parent capture so the child-renderer closures stored on
    # `$self->_child_renderers` don't keep `$self` alive (the direct
    # closure <-> parent cycle). The controller is reached through `$parent`
    # at call time rather than captured strongly here, so the closures hold
    # no strong reference to `$c` either — see the controller-cycle note in
    # `new`. `$parent` is always live whenever a closure runs (the closure is
    # stored on `$parent`, so `$parent` outlives every invocation).
    weaken(my $parent = $self);

    for my $entry_name (keys %$manifest) {
        # `__barefoot__` is the runtime entry, not a component.
        next if $entry_name eq '__barefoot__';
        # Only UI registry components (path shape `ui/<name>/index`)
        # become child renderers; top-level page components are the
        # render target rather than a child.
        next unless $entry_name =~ m{^ui/([^/]+)/index$};
        my $slot_key = $1;
        my $marked = $manifest->{$entry_name}{markedTemplate} // '';
        next unless $marked;
        # `templates/ui/button/index.html.ep` → `ui/button/index`
        my $template_name = $marked;
        $template_name =~ s{^templates/}{};
        $template_name =~ s{\.html\.ep$}{};

        my $signal_init = $signal_inits->{$slot_key};
        my $manifest_defaults = $manifest->{$entry_name}{ssrDefaults};
        $self->register_child_renderer($slot_key, sub {
            # `$caller` is the instance whose template invoked
            # `render_child` (#1897) — for a nested render that is a child
            # instance, and the grandchild's scope/slot identity must chain
            # off ITS scope id (`root_s0_s0`), not the registrant's.
            my ($props, $caller) = @_;
            my $host = $caller // $parent;
            my $host_scope = $host->_scope_id // $parent_scope;
            # Child shares the parent's backend so nested renders go
            # through the same engine + controller (and inherit any
            # injected json_encoder). The controller is fetched via the weak
            # `$parent` at call time — never captured strongly — so the
            # closure adds no edge to the per-request reference cycle.
            my $child_bf = BarefootJS->new($parent->c, { backend => $parent->backend });
            my $slot_id = delete $props->{_bf_slot};
            # JSX `key` (a reserved prop) → data-key on the child's scope root
            # for keyed-loop reconciliation (see `data_key_attr`).
            my $data_key = delete $props->{key};
            $child_bf->_data_key($data_key) if defined $data_key;
            $child_bf->_scope_id(
                $slot_id ? $host_scope . '_' . $slot_id
                         : $template_name . '_' . substr(rand() =~ s/^0\.//r, 0, 6)
            );
            $child_bf->_is_child(1);
            # (#1249) Slot identity: host scope + slot id. Emitted as
            # bf-h / bf-m attributes by hydration_attrs.
            if ($slot_id) {
                $child_bf->_bf_parent($host_scope);
                $child_bf->_bf_mount($slot_id);
            }
            # Share the root registry so the child's own template can
            # render further imported components (#1897).
            $child_bf->_child_renderers($parent->_child_renderers);
            $child_bf->_scripts($parent->_scripts);
            $child_bf->_script_seen($parent->_script_seen);

            my %extra;
            if ($signal_init) {
                %extra = $signal_init->($props);
            } elsif ($manifest_defaults) {
                %extra = _derive_stash_from_defaults($manifest_defaults, $props);
            }

            # Render the child template with $child_bf bound as the active
            # instance for the nested render. The backend owns the
            # engine-specific binding + restore (stash juggle for Mojo).
            my $html = $parent->backend->render_named(
                $template_name, $child_bf, { %$props, %extra },
            );
            chomp $html;
            return $html;
        });
    }
}

# Derive template-stash kvs from a manifest entry's `ssrDefaults`
# section. Each entry shape:
#   { value => <static-fallback>, propName => <prop>, isRestProps => bool }
# For `isRestProps`, the rest bag passes through unchanged (or the
# static `{}` if the caller didn't supply one). For ordinary entries
# the caller's `$props->{propName}` wins when defined, otherwise the
# static `value` does. `propName`-less entries (signal / memo locals)
# always use the static value — the caller cannot override them.
sub _derive_stash_from_defaults ($defaults, $props) {
    my %extra;
    for my $name (keys %$defaults) {
        my $d = $defaults->{$name};
        if (ref($d) ne 'HASH') {
            $extra{$name} = $d;
            next;
        }
        if ($d->{isRestProps}) {
            $extra{$name} = exists $props->{$name} ? $props->{$name} : $d->{value};
            next;
        }
        my $prop_name = $d->{propName};
        if (defined $prop_name && exists $props->{$prop_name} && defined $props->{$prop_name}) {
            $extra{$name} = $props->{$prop_name};
        } else {
            $extra{$name} = $d->{value};
        }
    }
    return %extra;
}

# ---------------------------------------------------------------------------
# Script Output
# ---------------------------------------------------------------------------

sub scripts ($self) {
    my @tags;
    for my $path (@{$self->_scripts}) {
        push @tags, qq{<script type="module" src="$path"></script>};
    }
    return join("\n", @tags);
}

# ---------------------------------------------------------------------------
# Streaming SSR (Out-of-Order)
# ---------------------------------------------------------------------------

sub streaming_bootstrap ($self) {
    return q{<script>(function(){function s(id){var a=document.querySelector('[bf-async="'+id+'"]');var t=document.querySelector('template[bf-async-resolve="'+id+'"]');if(!a||!t)return;a.replaceChildren(t.content.cloneNode(true));a.removeAttribute('bf-async');t.remove();requestAnimationFrame(function(){if(window.__bf_hydrate)window.__bf_hydrate()})};window.__bf_swap=s})()</script>};
}

sub async_boundary ($self, $id, $fallback_html) {
    # The fallback comes in via Mojo `begin %>...<% end` capture (see
    # MojoAdapter::renderAsync), which produces a CODE ref returning a
    # Mojo::ByteStream. Materialize it through the backend so the rendered
    # HTML embeds in the placeholder rather than the CODE ref's
    # stringification.
    $fallback_html = $self->backend->materialize($fallback_html);
    return qq{<div bf-async="$id">$fallback_html</div>};
}

sub async_resolve ($self, $id, $content_html) {
    return qq{<template bf-async-resolve="$id">$content_html</template><script>__bf_swap("$id")</script>};
}

# ---------------------------------------------------------------------------
# JS-compat callees (#1189) — invoked from generated Mojo templates as
# <%= bf->json($val) %>, <%= bf->floor($val) %>, etc. The MojoAdapter's
# `templatePrimitives` registry emits these helper calls in place of the
# corresponding JS callees (`JSON.stringify`, `Math.floor`, …) so the SSR
# template can render value-equivalent output without a JS engine.
#
# Failure policy mirrors the Go adapter (#1188): user-data marshalling
# (json) bubbles errors so Mojolicious aborts loudly on cycles /
# unsupported values rather than silently producing an empty payload.
# Numeric coercion follows JS semantics (NaN propagates as the special
# string 'NaN'; non-numeric input returns 'NaN' rather than 0). Strings
# always coerce to a string representation.
# ---------------------------------------------------------------------------

sub json ($self, $value) {
    # Mojo::JSON::to_json returns a character string (not bytes), suitable
    # for embedding in HTML output via Mojo::ByteStream / `<%==`.
    #
    # Documented divergence from JS: JS distinguishes `null` (renders as
    # "null") from `undefined` (`JSON.stringify(undefined)` returns the
    # JS value `undefined`, not a string). Perl has no such distinction
    # — both map to `undef`. We choose the `null` rendering for SSR
    # ergonomics: an unset prop becomes the string "null" rather than
    # the literal text "undefined" or an empty attribute. Matches the
    # `null` case of JS exactly; diverges from the `undefined` case.
    return $self->backend->encode_json($value);
}

sub string ($self, $value) {
    # JS `String(v)` mirror. `undef` renders as the empty string here so
    # an unset prop doesn't surface as a literal "undefined" / "null"
    # in user-facing HTML — same divergence the Go adapter documents
    # for `bf_string`.
    return defined $value ? "$value" : '';
}

sub number ($self, $value) {
    # JS `Number(v)` mirror. Numeric coerces via Perl's implicit
    # numeric context; non-numeric / undef yield real numeric NaN
    # (`'nan' + 0`) so downstream arithmetic propagates correctly
    # (`Math.floor(NaN) === NaN`). Returning the literal string
    # "NaN" would conflate the user-passing-the-string-"NaN" case
    # with the parse-failure case, and break NaN detection in
    # downstream helpers.
    return 0 + 'nan' unless defined $value;
    return $value + 0 if looks_like_number($value);
    return 0 + 'nan';
}

# NaN is the only float for which `$x != $x` holds. Used as the
# portable sentinel check in floor/ceil/round.
sub _is_nan { my $n = shift; return $n != $n }

sub floor ($self, $value) {
    my $n = $self->number($value);
    return $n if _is_nan($n);
    return POSIX::floor($n);
}

sub ceil ($self, $value) {
    my $n = $self->number($value);
    return $n if _is_nan($n);
    return POSIX::ceil($n);
}

sub round ($self, $value) {
    my $n = $self->number($value);
    return $n if _is_nan($n);
    # POSIX has no `round`. JS `Math.round` rounds half toward
    # +Infinity (so `Math.round(-1.5) === -1`, not -2). `floor(n
    # + 0.5)` reproduces that for both signs.
    return POSIX::floor($n + 0.5);
}

# ---------------------------------------------------------------------------
# Array / String method helpers (#1448 Tier A)
# ---------------------------------------------------------------------------
#
# `Array.prototype.includes(x)` and `String.prototype.includes(sub)`
# share a method name in JS; the JSX parser can't tell the two
# receiver shapes apart without TS type inference, so both lower to
# the same IR node (`array-method` / method `includes`). This helper
# dispatches at the Perl level via `ref()`:
#   - ARRAY ref:  scan elements with `eq`; one defined-vs-undef
#                 hop matches JS's `===` for null/undefined.
#   - scalar:     `index($recv, $sub) != -1`, with both args
#                 coerced through `// ''` so an undef receiver /
#                 needle doesn't trip Perl's substr warning.
# Anything else (HASH ref, code ref) returns false — matches the
# JS semantic where `.includes` is only defined on Array /
# TypedArray / String.

sub includes ($self, $recv, $elem) {
    if (ref($recv) eq 'ARRAY') {
        for my $item (@$recv) {
            if (!defined $item) {
                return 1 if !defined $elem;
                next;
            }
            return 1 if defined $elem && $item eq $elem;
        }
        return 0;
    }
    return 0 if ref($recv);
    return index($recv // '', $elem // '') != -1 ? 1 : 0;
}

# `Array.prototype.filter(fn)` / `.every(fn)` / `.some(fn)`. The Xslate adapter
# lowers a JS arrow predicate to a Kolon lambda (`-> $x { ... }`), which is
# callable from Perl as a code ref, and emits `$bf.filter($arr, <lambda>)`.
# `filter` returns a new arrayref; `every` / `some` return 1/0. Non-array /
# empty receivers follow JS (`filter` → [], `every` → true, `some` → false).
# (The Mojo adapter lowers these shapes inline and never reaches these methods.)
sub filter ($self, $recv, $pred) {
    return [] unless ref($recv) eq 'ARRAY';
    return [ grep { $pred->($_) } @$recv ];
}

sub every ($self, $recv, $pred) {
    return 1 unless ref($recv) eq 'ARRAY';
    for my $item (@$recv) { return 0 unless $pred->($item) }
    return 1;
}

sub some ($self, $recv, $pred) {
    return 0 unless ref($recv) eq 'ARRAY';
    for my $item (@$recv) { return 1 if $pred->($item) }
    return 0;
}

# `Array.prototype.find(fn)` / `.findIndex(fn)` / `.findLast(fn)` /
# `.findLastIndex(fn)` — same Kolon-lambda predicate mechanism as filter. The
# camelCase JS names lower to these snake_case methods (like index_of /
# last_index_of). `find` / `find_last` return the matching element (or undef →
# JS `undefined`); the index forms return the 0-based position (or -1).
sub find ($self, $recv, $pred) {
    return undef unless ref($recv) eq 'ARRAY';
    for my $item (@$recv) { return $item if $pred->($item) }
    return undef;
}

sub find_index ($self, $recv, $pred) {
    return -1 unless ref($recv) eq 'ARRAY';
    for my $i (0 .. $#$recv) { return $i if $pred->($recv->[$i]) }
    return -1;
}

sub find_last ($self, $recv, $pred) {
    return undef unless ref($recv) eq 'ARRAY';
    for my $i (reverse 0 .. $#$recv) { return $recv->[$i] if $pred->($recv->[$i]) }
    return undef;
}

sub find_last_index ($self, $recv, $pred) {
    return -1 unless ref($recv) eq 'ARRAY';
    for my $i (reverse 0 .. $#$recv) { return $i if $pred->($recv->[$i]) }
    return -1;
}

# `String.prototype.toLowerCase()` / `.toUpperCase()`. Kolon has a builtin
# `.join` array method (so the adapter uses that directly) but no builtin
# `lc` / `uc`, so these live on the runtime object. `CORE::` avoids recursing
# into these methods.
sub lc ($self, $s) { return defined $s ? CORE::lc($s) : '' }
sub uc ($self, $s) { return defined $s ? CORE::uc($s) : '' }

# `Array.prototype.join(sep)` with JS semantics: separator defaults to ",",
# and undefined / null elements render as empty (`[1,,2].join(",")` → "1,,2").
# Kolon has a builtin `.join`, but routing through the runtime keeps the
# JS-compat element handling in one place. `CORE::join` avoids recursing.
sub join ($self, $recv, $sep = undef) {
    return '' unless ref($recv) eq 'ARRAY';
    $sep //= ',';
    return CORE::join($sep, map { defined $_ ? $_ : '' } @$recv);
}

# `.length` — JS works on BOTH arrays (element count) and strings (character
# count); Kolon's builtin `.size()` is array-only and faults on a string. So
# dispatch on ref type here. `CORE::length` avoids recursing into this method.
sub length ($self, $recv) {
    return scalar @$recv if ref($recv) eq 'ARRAY';
    return 0 if ref($recv);
    return CORE::length($recv // '');
}

# `Array.prototype.indexOf(x)` / `Array.prototype.lastIndexOf(x)`
# value-equality search (#1448 Tier A). Returns the 0-based position
# of the first / last matching element, or -1 if not found.
# Non-array receivers return -1 — matches the JS semantic that
# `.indexOf` / `.lastIndexOf` are only defined on Array / TypedArray.
# (The string-position `indexOf` form isn't in Tier A; if it lands
# later the helper can grow a ref()-dispatch branch like `includes`.)

sub _array_index_of ($recv, $elem, $reverse) {
    return -1 unless ref($recv) eq 'ARRAY';
    my @indices = $reverse ? (reverse 0 .. $#{$recv}) : (0 .. $#{$recv});
    for my $i (@indices) {
        my $item = $recv->[$i];
        if (!defined $item) {
            return $i if !defined $elem;
            next;
        }
        return $i if defined $elem && $item eq $elem;
    }
    return -1;
}

sub index_of ($self, $recv, $elem) {
    return _array_index_of($recv, $elem, 0);
}

sub last_index_of ($self, $recv, $elem) {
    return _array_index_of($recv, $elem, 1);
}

# `Array.prototype.at(i)` — supports negative indices (`.at(-1)` is
# the last element); out-of-bounds returns undef (which Mojo's
# auto-escape renders as the empty string, matching JS's `undefined`).
# Non-array receivers return undef. Matches the Go `bf_at` arithmetic
# (`length + i` for i < 0) so adapter output stays symmetric.

sub at ($self, $recv, $i) {
    return undef unless ref($recv) eq 'ARRAY';
    return undef if !defined $i;
    my $len = scalar @$recv;
    return undef if $len == 0;
    my $idx = $i < 0 ? $len + $i : $i;
    return undef if $idx < 0 || $idx >= $len;
    return $recv->[$idx];
}

# `Array.prototype.concat(other)` — merges two arrays in order
# into a new ARRAY ref. Non-array operands collapse to empty
# (matches the Go `bf_concat` semantic so cross-adapter output
# stays symmetric; differs from JS where a non-Array argument
# with `Symbol.isConcatSpreadable` would be spread, a behaviour
# the template-language path never observes).

sub concat ($self, $a, $b) {
    my @out;
    push @out, @$a if ref($a) eq 'ARRAY';
    push @out, @$b if ref($b) eq 'ARRAY';
    return \@out;
}

# `Array.prototype.slice(start, end?)` — carves out a sub-range
# into a new ARRAY ref. Mirrors the Go `bf_slice` arithmetic so
# adapter output stays symmetric:
#   - start < 0          → length + start  (e.g. -1 = last index)
#   - end < 0            → length + end
#   - start < 0 after clamp → 0
#   - end > length       → length
#   - start >= end       → empty
#   - end undef          → "to length"
# Non-array receivers return an empty ARRAY ref.

sub slice ($self, $recv, $start, $end) {
    return [] unless ref($recv) eq 'ARRAY';
    my $len = scalar @$recv;
    return [] if $len == 0;

    my $s = $start // 0;
    $s = $len + $s if $s < 0;
    $s = 0    if $s < 0;
    $s = $len if $s > $len;

    my $e = defined $end ? $end : $len;
    $e = $len + $e if $e < 0;
    $e = 0    if $e < 0;
    $e = $len if $e > $len;

    return [] if $s >= $e;
    return [ @{$recv}[$s .. $e - 1] ];
}

# `Array.prototype.reverse()` / `Array.prototype.toReversed()` —
# both shapes share this lowering. SSR templates render a snapshot
# of state, so JS's mutate-receiver (`reverse`) vs
# return-new-array (`toReversed`) distinction has no template-
# level meaning. Always returns a new ARRAY ref to keep callers
# safe from accidental aliasing. Non-array receivers return an
# empty ARRAY ref.

sub reverse ($self, $recv) {
    return [] unless ref($recv) eq 'ARRAY';
    return [ reverse @$recv ];
}

# `Array.prototype.flat(depth?)` (#1448 Tier C) — flatten nested ARRAY
# refs `$depth` levels deep. A `$depth` of -1 is the `Infinity` sentinel
# (flatten fully); 0 returns a shallow copy. Non-ARRAY elements are kept
# as-is (JS only flattens nested arrays). Non-ARRAY receiver → [].
sub flat ($self, $recv, $depth = 1) {
    return [] unless ref($recv) eq 'ARRAY';
    my @out;
    for my $el (@$recv) {
        if ($depth != 0 && ref($el) eq 'ARRAY') {
            my $next = $depth > 0 ? $depth - 1 : $depth;
            push @out, @{ $self->flat($el, $next) };
        }
        else {
            push @out, $el;
        }
    }
    return \@out;
}

# `Array.prototype.flatMap(fn)` value-returning field projection
# (#1448 Tier C) — map each element through a self / field projection,
# then flatten one level. `field` reads a HASH-ref key (the raw JS prop
# name, as `bf->reduce` does); a projected non-ARRAY value is kept as-is
# (flatMap = map + flat(1)). Non-ARRAY receiver → [].
sub flat_map ($self, $recv, $key_kind, $key) {
    return [] unless ref($recv) eq 'ARRAY';
    my @projected;
    for my $el (@$recv) {
        if ($key_kind eq 'field') {
            # JS `i => i.field` on a non-object yields `undefined`, not the
            # element itself — push `undef` so a scalar element doesn't leak
            # into the output (matches Go's `getFieldValue` returning nil).
            push @projected, ref($el) eq 'HASH' ? $el->{$key} : undef;
        }
        else {
            push @projected, $el;
        }
    }
    return $self->flat(\@projected, 1);
}

# `Array.prototype.flatMap(i => [i.a, i.b])` — array-literal tuple
# projection (#1448 Tier C). Each `@specs` entry is a [kind, key] arrayref
# (['self', ''] or ['field', 'a']). For each element, every leaf's value
# is appended in order. flat(1) removes only the literal wrapper, so an
# array-valued leaf is appended verbatim (no spread) — i.e. just append
# each leaf. A non-HASH element under a `field` leaf yields undef (JS
# `i.field` on a non-object). Non-ARRAY receiver → [].
sub flat_map_tuple ($self, $recv, @specs) {
    return [] unless ref($recv) eq 'ARRAY';
    my @out;
    for my $el (@$recv) {
        for my $spec (@specs) {
            my ($kind, $key) = @$spec;
            if ($kind eq 'field') {
                push @out, ref($el) eq 'HASH' ? $el->{$key} : undef;
            }
            else {
                push @out, $el;
            }
        }
    }
    return \@out;
}

# `String.prototype.trim()` — strip leading + trailing whitespace.
# JS's `String.prototype.trim` matches `\s` in the Unicode sense
# (any whitespace including non-breaking space U+00A0); Perl's `\s`
# inside a regex with `/u` flag is the same. Undef receivers return
# the empty string (matches JS's `String(undefined).trim()` which
# would be "undefined" → "undefined", but in our template context
# undef commonly means "missing prop"; rendering the empty string
# is the safer choice and mirrors the JS-compat divergence we
# already document for `bf->string(undef) === ""`).

sub trim ($self, $recv) {
    return '' unless defined $recv;
    return '' if ref($recv);
    my $s = "$recv";
    $s =~ s/^\s+|\s+$//gu;
    return $s;
}

# `Number.prototype.toFixed(digits)` (#1897) — fixed-decimal string with
# zero-padding. JS rounds the scaled integer half toward +Infinity (the
# spec's "pick the larger n" tie-break), so `(2.5).toFixed(0)` is "3";
# bare `sprintf("%.*f")` would round half-to-even ("2"), diverging. Scale
# by 10**digits, round with `floor(x + 0.5)` (the same tie-break the
# `round` helper uses), then format the exact multiple. A negative
# `digits` clamps to 0, mirroring how the adapters default an omitted
# argument.
sub to_fixed ($self, $value, $digits = 0) {
    my $n = $self->number($value);
    # JS `(NaN).toFixed(d)` is the STRING "NaN"; returning the numeric NaN
    # would stringify per-platform ("nan"/"NaN"/...) and diverge.
    return 'NaN' if _is_nan($n);
    $digits = 0 if !defined $digits || $digits < 0;
    my $factor  = 10 ** $digits;
    my $rounded = POSIX::floor($n * $factor + 0.5);
    return sprintf('%.*f', $digits, $rounded / $factor);
}

# `String.prototype.split(sep)` (#1448 Tier B) — string → ARRAY ref.
#
# Two JS-parity wrinkles drive the helper (a bare `split` emit would
# diverge from both JS and Go):
#
#   * Perl's `split` treats its first argument as a *regex*, so a
#     separator like '.' or '|' would match far too much. We
#     `quotemeta` it to force literal-string matching, mirroring JS's
#     string-separator semantics (the regex-separator form stays
#     refused upstream — see the parser arm).
#   * Perl's `split` drops trailing empty fields by default; JS keeps
#     them (`"a,".split(",")` is `["a", ""]`). Passing the `-1` limit
#     preserves them, matching JS and Go's `strings.Split`.
#
# An empty separator splits into individual characters (JS + Go agree).
# Undef receiver renders as the single-element `['']` — the same
# "missing prop → empty string" convention `bf->trim` uses.

sub split ($self, $recv, $sep = undef, $limit = undef) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';

    my @parts;
    if (!defined $sep) {
        # No separator → the whole string in a single-element array
        # (matches JS `"x".split()` / `.split(undefined)`).
        @parts = ($s);
    }
    elsif ("$sep" eq '') {
        # Empty separator → individual characters. No `-1` limit here:
        # on an empty pattern Perl's `split` with `-1` appends a spurious
        # trailing empty field ("abc" → 'a','b','c',''), which JS/Go don't.
        @parts = split //, $s;
    }
    elsif ($s eq '') {
        # Empty input with a non-empty separator: JS `"".split(",")` is
        # `[""]` and Go's `strings.Split("", ",")` is `[""]`, but Perl's
        # `split /,/, ''` returns the empty list — special-case for parity.
        @parts = ('');
    }
    else {
        # `quotemeta` forces literal-string matching (JS string-separator
        # semantics); the `-1` keeps trailing empty fields (JS keeps them,
        # Perl's bare `split` drops them).
        my $q = quotemeta("$sep");
        @parts = split /$q/, $s, -1;
    }

    # Optional `limit` caps the number of pieces (JS `split(sep, limit)`).
    # 0 → empty; a negative limit keeps all (JS ToUint32 wrap makes it
    # effectively unbounded) — both match Go's `bf_split`.
    if (defined $limit) {
        my $n = int($limit);
        if ($n == 0) { @parts = () }
        elsif ($n > 0 && $n < scalar @parts) { @parts = @parts[0 .. $n - 1] }
    }

    return [@parts];
}

# `String.prototype.startsWith(prefix, position?)` (#1448 Tier B) —
# string → boolean (1 / 0). `substr`-anchored literal comparison mirrors
# Go's `strings.HasPrefix`. An empty prefix is always true (JS parity);
# undef / non-string receivers coerce to the empty string first. The
# optional `position` re-anchors the test (clamped to `[0, length]`),
# matching JS `"abc".startsWith("b", 1)`.

sub starts_with ($self, $recv, $prefix, $position = undef) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';
    my $p = defined $prefix ? "$prefix" : '';
    if (defined $position) {
        my $n = int($position);
        $n = 0 if $n < 0;
        $n = CORE::length($s) if $n > CORE::length($s);
        $s = substr($s, $n);
    }
    return substr($s, 0, CORE::length $p) eq $p ? 1 : 0;
}

# `String.prototype.endsWith(suffix, endPosition?)` (#1448 Tier B) —
# string → boolean (1 / 0). Mirrors Go's `strings.HasSuffix`. An empty
# suffix is always true (JS parity); a suffix longer than the string is
# false. `substr($s, -length $x)` would mis-read the whole string when
# `length $x == 0`, so that case short-circuits. The optional
# `endPosition` treats the string as if it were only that many chars
# long (clamped to `[0, length]`), matching JS `"abc".endsWith("b", 2)`.

sub ends_with ($self, $recv, $suffix, $end_position = undef) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';
    my $x = defined $suffix ? "$suffix" : '';
    if (defined $end_position) {
        my $e = int($end_position);
        $e = 0 if $e < 0;
        $e = CORE::length($s) if $e > CORE::length($s);
        $s = substr($s, 0, $e);
    }
    return 1 if $x eq '';
    return 0 if CORE::length($s) < CORE::length($x);
    return substr($s, -CORE::length $x) eq $x ? 1 : 0;
}

# `String.prototype.replace(pattern, replacement)` — string-pattern
# form only (#1448 Tier B), replacing the FIRST occurrence (JS string-
# pattern semantics). Spliced via index/substr rather than `s///` so
# BOTH the pattern and the replacement are literal: no Perl regex
# metacharacters in the pattern and no `$1` / `$&` interpolation in the
# replacement. Go's `bf_replace` (strings.Replace, n=1) treats the
# replacement literally too, so the two adapters stay byte-equal — this
# diverges from JS only for replacement strings containing `$`-patterns
# (rare in template position). An empty pattern inserts the replacement
# at the front (`"abc".replace("", "X")` → "Xabc"), matching JS + Go.

sub replace ($self, $recv, $pattern, $replacement) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';
    my $o = defined $pattern ? "$pattern" : '';
    my $n = defined $replacement ? "$replacement" : '';
    return $n . $s if $o eq '';
    my $i = index($s, $o);
    return $s if $i < 0;
    return substr($s, 0, $i) . $n . substr($s, $i + CORE::length($o));
}

# `String.prototype.repeat(n)` — the receiver concatenated n times
# (#1448 Tier B), via Perl's `x` operator. JS throws RangeError for a
# negative count, but SSR templates degrade to the empty string rather
# than dying mid-render, so a count <= 0 returns "" (Go's `bf_repeat`
# applies the same clamp). The count is truncated toward zero
# (`int`), matching JS's ToIntegerOrInfinity on `"a".repeat(3.7)`.

sub repeat ($self, $recv, $count) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';
    my $n = defined $count ? int($count) : 0;
    return $n <= 0 ? '' : $s x $n;
}

# `String.prototype.padStart` / `padEnd` (#1448 Tier B) — pad the
# receiver to `$target` characters with `$pad` (default a single space)
# repeated and truncated to fill, prepended or appended. Length is
# measured in characters (Perl `length`), matching Go's rune-based
# `bf_pad_*` — diverges from JS's UTF-16-unit length only for
# astral-plane input. An empty pad, or a receiver already >= `$target`,
# returns the receiver unchanged (JS parity). The `$target` is
# truncated toward zero (JS ToLength on the first arg).

sub _pad ($s, $target, $pad, $at_start) {
    $pad = ' ' unless defined $pad;
    $pad = "$pad";
    return $s if $pad eq '';
    my $len = CORE::length $s;
    my $t   = int($target // 0);
    return $s if $len >= $t;
    my $need = $t - $len;
    # Repeat enough copies to cover $need, then trim to exactly $need.
    my $fill = substr($pad x (int($need / CORE::length($pad)) + 1), 0, $need);
    return $at_start ? $fill . $s : $s . $fill;
}

sub pad_start ($self, $recv, $target, $pad = undef) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';
    return _pad($s, $target, $pad, 1);
}

sub pad_end ($self, $recv, $target, $pad = undef) {
    my $s = defined $recv && !ref($recv) ? "$recv" : '';
    return _pad($s, $target, $pad, 0);
}

# `Array.prototype.sort(cmp)` / `Array.prototype.toSorted(cmp)`
# lowering (#1448 Tier B). Non-mutating — JS's mutate-vs-new
# distinction is moot in SSR template context.
#
# Opts hash-ref. The compiler emits a `keys` list of per-key hashes
# in priority order; each hash carries:
#
#   key_kind     => 'self' | 'field'
#   key          => '' when key_kind eq 'self'; field name verbatim
#                   from the comparator AST (e.g. 'price', 'createdAt')
#                   when key_kind eq 'field' — no case normalisation
#                   applied. Perl hash lookups are case-sensitive so
#                   the key here must match the actual hash key the
#                   user populated.
#   compare_type => 'numeric' | 'string' | 'auto'
#   direction    => 'asc' | 'desc'
#
# Accepted comparator catalogue (gated upstream at parse time —
# anything outside refuses with BF101 before reaching this helper):
#
#   (a,b) => a.f - b.f                       → field, numeric
#   (a,b) => a - b                           → self,  numeric
#   (a,b) => a[.f].localeCompare(b[.f])      → field|self, string
#   (a,b) => a.f > b.f ? 1 : -1              → field|self, auto
#   any of the above ||-chained              → multi-key tie-breaks
#   (and reversed-operand variants for `desc`).
#
# `auto` (relational-ternary lowering) compares numerically when both
# keys `looks_like_number`, else lexically — Go's `bf_sort` applies the
# same rule so the two template adapters stay byte-equal.
#
# A future `nulls => 'first' | 'last'` knob can land per key without
# churn — the opts hash is the right place to grow.

sub sort ($self, $recv, $opts = {}) {
    return [] unless ref($recv) eq 'ARRAY';

    # Normalise the per-key specs (priority order, length >= 1).
    my @spec = map {
        {
            key_kind     => $_->{key_kind}     // 'self',
            key          => $_->{key}          // '',
            compare_type => $_->{compare_type} // 'numeric',
            direction    => $_->{direction}    // 'asc',
        }
    } @{ $opts->{keys} // [] };
    return [ @$recv ] unless @spec;

    # Schwartzian transform: project each item to all its sort keys
    # once, then compare projected keys. Cheaper than re-resolving the
    # field accessors inside every comparison for non-trivial arrays.
    my @keyed = map {
        my $item = $_;
        my @ks = map {
            $_->{key_kind} eq 'field' && ref($item) eq 'HASH' ? $item->{ $_->{key} } : $item;
        } @spec;
        [ \@ks, $item ];
    } @$recv;

    my $cmp = sub {
        for my $i (0 .. $#spec) {
            my $sp = $spec[$i];
            my $c  = _compare_sort_key($a->[0][$i], $b->[0][$i], $sp->{compare_type});
            next if $c == 0;            # tie on this key — try the next
            return $sp->{direction} eq 'desc' ? -$c : $c;
        }
        return 0;
    };

    my @sorted = sort $cmp @keyed;
    return [ map { $_->[1] } @sorted ];
}

# Compare two projected keys, ascending orientation (-1 / 0 / 1); the
# caller negates for 'desc'. 'auto' compares numerically when both
# keys look like numbers, else lexically (matches Go's `bf_sort`).
# undef coalesces to '' / 0 so the order stays total without warnings.
sub _compare_sort_key ($av, $bv, $compare_type) {
    if ($compare_type eq 'string') {
        return ($av // '') cmp ($bv // '');
    }
    if ($compare_type eq 'auto') {
        if (looks_like_number($av // '') && looks_like_number($bv // '')) {
            return ($av // 0) <=> ($bv // 0);
        }
        return ($av // '') cmp ($bv // '');
    }
    return ($av // 0) <=> ($bv // 0);    # numeric
}

# Fold an array into a scalar via the arithmetic-fold catalogue
# (#1448 Tier C). Mirrors Go's `bf_reduce` and JS `reduce(fn, init)` /
# `reduceRight(fn, init)` for the shapes `(acc, x) => acc <op> x` /
# `(acc, x) => acc <op> x.field`:
#
#   bf->reduce($recv, {
#     op        => '+' | '*',
#     key_kind  => 'self' | 'field',
#     key       => '<field>',         # when key_kind eq 'field'
#     type      => 'numeric' | 'string',
#     init      => <seed>,            # number, or string for concat
#     direction => 'left' | 'right',  # 'right' = reduceRight (default 'left')
#   })
#
# Numeric folds accumulate with `+` / `*` (non-numeric keys coalesce to
# 0); string folds concatenate via `bf->string` (undef → ''). The init
# seeds the accumulator, so an empty array returns it unchanged — exactly
# like JS. `direction => 'right'` folds right-to-left (reduceRight); only
# observable for string concat, since numeric sum / product commute.
# Float stringification can diverge from Go's for inexact binary
# fractions (e.g. 0.1 + 0.2); integer sums — the common case — agree.
sub reduce ($self, $recv, $opts = {}) {
    my $op        = $opts->{op}        // '+';
    my $key_kind  = $opts->{key_kind}  // 'self';
    my $key       = $opts->{key}       // '';
    my $type      = $opts->{type}      // 'numeric';
    my $direction = $opts->{direction} // 'left';

    my @items = ref($recv) eq 'ARRAY' ? @$recv : ();
    # reduceRight folds right-to-left; reversing the snapshot keeps the
    # single forward loop below. Only observable for string concat —
    # numeric sum / product commute. Qualify as CORE::reverse — this
    # package defines `sub reverse` (the `.reverse()` helper), so a bare
    # `reverse` is ambiguous under `use warnings`.
    @items = CORE::reverse(@items) if $direction eq 'right';
    my $project = sub ($item) {
        $key_kind eq 'field' && ref($item) eq 'HASH' ? $item->{$key} : $item;
    };

    if ($type eq 'string') {
        my $acc = $opts->{init} // '';
        $acc .= $self->string($project->($_)) for @items;
        return $acc;
    }

    my $acc = $opts->{init} // 0;
    for my $item (@items) {
        my $n = $project->($item);
        # Guard `defined` before `looks_like_number` so a missing field
        # (undef) folds as 0 without an "uninitialized value" warning
        # under `use warnings` — matching the `$av // ''` style `sort` uses.
        $n = 0 unless defined $n && looks_like_number($n);
        $op eq '*' ? ($acc *= $n) : ($acc += $n);
    }
    return $acc;
}

# ---------------------------------------------------------------------------
# JSX intrinsic-element spread (#1407)
# ---------------------------------------------------------------------------
#
# Mirrors the JS `spreadAttrs` runtime
# (`packages/client/src/runtime/spread-attrs.ts`) and the Go adapter's
# `bf.SpreadAttrs` so SSR output stays byte-equal across the three
# adapters. Generated Mojo templates invoke this as
# `<%== bf->spread_attrs($bag) %>`.
#
# Skip rules: nil/false values, event handlers (`on[A-Z]…` shape
# matching JS `key[2] === key[2].toUpperCase()` — true for any
# character whose uppercase is itself, including digits and
# underscore), `children`. `ref` is intentionally NOT filtered,
# matching the JS reference.
#
# Key remap: className → class, htmlFor → for; SVG camelCase
# attrs preserved (case-sensitive XML spec); other camelCase keys
# lowered to kebab-case with a leading `-` for an initial
# uppercase letter (mirrors JS `key.replace(/([A-Z])/g, '-$1')`).
#
# `style` is routed through `_style_to_css` so object literals
# serialise to a real CSS string instead of Perl's default
# `HASH(0x...)` form.
#
# Output is deterministic: keys are sorted alphabetically before
# emission, matching the Go adapter's `sort.Strings(keys)` policy
# and Mojo::JSON's marshal order.
#
# The return value is a Mojo::ByteStream so the calling template's
# `<%==` raw-emit skips re-escaping (the helper has already
# HTML-escaped each value).

my %SVG_CAMEL_CASE_ATTRS = map { $_ => 1 } qw(
    allowReorder attributeName attributeType autoReverse
    baseFrequency baseProfile calcMode clipPathUnits
    contentScriptType contentStyleType diffuseConstant edgeMode
    externalResourcesRequired filterRes filterUnits glyphRef
    gradientTransform gradientUnits kernelMatrix kernelUnitLength
    keyPoints keySplines keyTimes lengthAdjust limitingConeAngle
    markerHeight markerUnits markerWidth maskContentUnits
    maskUnits numOctaves pathLength patternContentUnits
    patternTransform patternUnits pointsAtX pointsAtY pointsAtZ
    preserveAlpha preserveAspectRatio primitiveUnits refX refY
    repeatCount repeatDur requiredExtensions requiredFeatures
    specularConstant specularExponent spreadMethod startOffset
    stdDeviation stitchTiles surfaceScale systemLanguage
    tableValues targetX targetY textLength viewBox viewTarget
    xChannelSelector yChannelSelector zoomAndPan
);

sub _to_attr_name ($key) {
    return 'class' if $key eq 'className';
    return 'for'   if $key eq 'htmlFor';
    return $key    if $SVG_CAMEL_CASE_ATTRS{$key};
    # camelCase → kebab-case, with a leading `-` for an initial
    # uppercase letter (JS-reference parity, even though that case
    # produces an HTML-invalid attribute name — same documented
    # behaviour as the Go adapter's `toAttrName`).
    my $out = $key;
    $out =~ s/([A-Z])/-\L$1/g;
    return $out;
}

sub _html_escape ($value) {
    # HTML attribute-value escape for SSR string emission. The
    # spread bag's values reach the browser as part of a generated
    # `key="..."` substring inside the rendered HTML, so the
    # escape set has to cover everything that could break either
    # the surrounding double-quoted attribute or the enclosing
    # tag: `&`, `<`, `>`, `"`, and `'`. Matches Go's
    # `template.HTMLEscapeString` semantics byte-for-byte (using
    # `&#34;` / `&#39;` for quotes rather than the named entities)
    # so the SSR output is identical across the Go and Mojo
    # adapters (#1407, #1413 review). The CSR-side
    # `applyRestAttrs` calls `el.setAttribute(name, String(value))`
    # — which does its own DOM-level escaping in the browser —
    # so JS doesn't need an explicit escape pass; Perl/Go emit a
    # string, so we do.
    my $s = defined $value ? "$value" : '';
    $s =~ s/&/&amp;/g;
    $s =~ s/</&lt;/g;
    $s =~ s/>/&gt;/g;
    $s =~ s/"/&#34;/g;
    $s =~ s/'/&#39;/g;
    return $s;
}

sub _style_to_css ($value) {
    return undef unless defined $value;
    # Non-hashref values pass through stringified — matches the JS
    # `typeof value !== 'object'` branch in `styleToCss`.
    if (ref($value) ne 'HASH') {
        my $s = "$value";
        return CORE::length $s ? $s : undef;
    }
    my @parts;
    for my $key (sort keys %$value) {
        my $v = $value->{$key};
        next unless defined $v;
        my $prop = $key;
        $prop =~ s/([A-Z])/-\L$1/g;
        push @parts, "$prop:$v";
    }
    return @parts ? CORE::join(';', @parts) : undef;
}

sub spread_attrs ($self, $bag) {
    return '' unless defined $bag && ref($bag) eq 'HASH';
    my @parts;
    for my $key (sort keys %$bag) {
        # Event handlers: skip when key starts `on` and the third
        # character is its own uppercase form (uppercase letter,
        # digit, underscore, …). Mirrors the JS predicate.
        if (CORE::length($key) > 2 && substr($key, 0, 2) eq 'on') {
            my $c = substr($key, 2, 1);
            next if CORE::uc($c) eq $c;
        }
        next if $key eq 'children';
        my $val = $bag->{$key};
        # null / undef → drop.
        next unless defined $val;
        # Boolean values arrive as Mojo::JSON sentinel objects
        # (`Mojo::JSON::true` / `false`) — both from JSON-deserialised
        # props and from the test harness's `toPerlLiteral`
        # (which emits the sentinels rather than plain 0/1 to avoid
        # conflating booleans with numeric attribute values like
        # `tabindex="0"`). The contract is: callers MUST use the
        # sentinels for boolean values; plain Perl scalars 0/1
        # render as numeric attribute values, matching how JS
        # `spreadAttrs` treats a `0`/`1` JS number.
        if (ref($val) eq 'JSON::PP::Boolean' || ref($val) eq 'Mojo::JSON::_Bool') {
            next unless $val;
            push @parts, _to_attr_name($key);
            next;
        }
        # `style` routes through `_style_to_css` so object literals
        # serialise to a real CSS string.
        if ($key eq 'style') {
            my $css = _style_to_css($val);
            next unless defined $css && CORE::length $css;
            push @parts, qq{style="} . _html_escape($css) . qq{"};
            next;
        }
        my $name = _to_attr_name($key);
        push @parts, $name . qq{="} . _html_escape($val) . qq{"};
    }
    return '' unless @parts;
    # Mark the result raw so the calling template's `<%==` raw-emit
    # doesn't re-escape the already-escaped values (the Mojo backend
    # returns a Mojo::ByteStream).
    return $self->backend->mark_raw(CORE::join(' ', @parts));
}

1;
__END__

=encoding utf8

=head1 NAME

BarefootJS - Engine- and framework-agnostic server runtime for BarefootJS marked templates

=head1 SYNOPSIS

    use BarefootJS;

    # A host injects a rendering backend (see BarefootJS::Backend::Xslate or
    # Mojolicious::Plugin::BarefootJS for shipping backends).
    my $bf = BarefootJS->new($context, { backend => $backend });

    # The compiled marked template calls the runtime as a `bf` object:
    #   <: $bf.scope_attr() :>  <: $bf.json($data) :>  <: $bf.spread_attrs($h) :>

=head1 DESCRIPTION

BarefootJS compiles JSX/TSX into a marked template plus client JS. This module
is the server-side runtime the marked templates call into at render time. It is
deliberately template-engine- and web-framework-agnostic: every operation that
depends on I<how> a template is rendered — JSON marshalling, raw-string marking,
JSX-children materialisation, and named-template rendering — is delegated to a
pluggable C<backend>.

That design lets the one runtime drive any backend. Shipping backends:

=over 4

=item * L<BarefootJS::Backend::Xslate> — Text::Xslate (Kolon); runs under any PSGI/Plack app.

=item * L<BarefootJS::Backend::Mojo> — Mojolicious (via L<Mojolicious::Plugin::BarefootJS>).

=back

The core itself pulls in only core Perl modules (C<POSIX>, C<Scalar::Util>);
no template engine or web framework is loaded unless a backend that needs one
is used.

=head1 SEE ALSO

L<BarefootJS::Backend::Xslate>, L<Mojolicious::Plugin::BarefootJS>,
L<https://github.com/piconic-ai/barefootjs>

=head1 AUTHOR

kobaken E<lt>kentafly88@gmail.comE<gt>

=head1 LICENSE

Copyright (c) 2025-present BarefootJS Contributors.

This library is free software; you can redistribute it and/or modify it under
the MIT License. See the F<LICENSE> file in the distribution for the full text.

=cut
