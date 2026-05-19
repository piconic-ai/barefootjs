package BarefootJS;
use Mojo::Base -base, -signatures;

use Mojo::ByteStream qw(b);
use Mojo::JSON qw(encode_json to_json);
use POSIX ();
use Scalar::Util qw(looks_like_number weaken);

has 'c';       # Mojolicious controller
has 'config';  # Plugin config

# Internal state
has '_scripts' => sub { [] };
has '_script_seen' => sub { {} };
has '_scope_id';
has '_is_child' => 0;
has '_bf_parent';  # Host scope id when this scope is a slot-attached child
has '_bf_mount';   # Slot id in host
has '_props';

sub new ($class, $c, $config = {}) {
    return $class->SUPER::new(
        c      => $c,
        config => $config,
    );
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

sub props_attr ($self) {
    my $props = $self->_props;
    return '' unless $props && %$props;
    # to_json returns a character string (not bytes) for safe embedding in templates
    my $json = to_json($props);
    return qq{ bf-p='$json'};
}

# ---------------------------------------------------------------------------
# Comment Markers
# ---------------------------------------------------------------------------

sub comment ($self, $text) {
    return "<!--bf-$text-->";
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
        $props_json = '|' . to_json($self->_props);
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

has '_child_renderers' => sub { {} };

sub register_child_renderer ($self, $name, $renderer) {
    $self->_child_renderers->{$name} = $renderer;
}

sub render_child ($self, $name, %props) {
    my $renderer = $self->_child_renderers->{$name};
    die "No renderer registered for child component '$name'" unless $renderer;
    # JSX children come in via Mojo `begin %>...<% end` capture, which
    # produces a CODE ref returning a Mojo::ByteStream. Materialize it
    # before handing the props to the child renderer so the child
    # template sees `$children` as already-rendered HTML.
    $props{children} = $props{children}->() if ref($props{children}) eq 'CODE';
    return $renderer->(\%props);
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
# `signal_init` is an optional hashref of `name => coderef`. Each
# coderef receives the caller's props hashref and returns key/value
# pairs that get stashed into the child template's lexical scope —
# typically the initial values of every `createSignal` / `createMemo`
# declared in the JSX source (Perl's strict mode rejects undefined
# `$variant`, `$size`, etc. otherwise).
#
# When `bf build` learns to embed these defaults in the manifest
# itself (tracked separately), this helper will derive them
# automatically and callers can drop the signal_init argument.
sub register_components_from_manifest ($self, $manifest, %opts) {
    my $c = $self->c;
    my $signal_inits = $opts{signal_init} // {};
    my $parent_scope = $self->_scope_id;
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
        $self->register_child_renderer($slot_key, sub {
            my ($props) = @_;
            my $child_bf = BarefootJS->new($c, {});
            my $slot_id = delete $props->{_bf_slot};
            $child_bf->_scope_id(
                $slot_id ? $parent_scope . '_' . $slot_id
                         : $template_name . '_' . substr(rand() =~ s/^0\.//r, 0, 6)
            );
            $child_bf->_is_child(1);
            # (#1249) Slot identity: host scope + slot id. Emitted as
            # bf-h / bf-m attributes by hydration_attrs.
            if ($slot_id) {
                $child_bf->_bf_parent($parent_scope);
                $child_bf->_bf_mount($slot_id);
            }
            $child_bf->_scripts($parent->_scripts);
            $child_bf->_script_seen($parent->_script_seen);

            my %extra;
            %extra = $signal_init->($props) if $signal_init;

            my $prev = $c->stash->{'bf.instance'};
            $c->stash->{'bf.instance'} = $child_bf;
            my $html = $c->render_to_string(
                template => $template_name, %$props, %extra,
            );
            $c->stash->{'bf.instance'} = $prev;
            chomp $html;
            return $html;
        });
    }
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
    # Mojo::ByteStream. Materialize it so the rendered HTML embeds in
    # the placeholder rather than the CODE ref's stringification.
    $fallback_html = $fallback_html->() if ref($fallback_html) eq 'CODE';
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
    return to_json($value);
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
        return length $s ? $s : undef;
    }
    my @parts;
    for my $key (sort keys %$value) {
        my $v = $value->{$key};
        next unless defined $v;
        my $prop = $key;
        $prop =~ s/([A-Z])/-\L$1/g;
        push @parts, "$prop:$v";
    }
    return @parts ? join(';', @parts) : undef;
}

sub spread_attrs ($self, $bag) {
    return '' unless defined $bag && ref($bag) eq 'HASH';
    my @parts;
    for my $key (sort keys %$bag) {
        # Event handlers: skip when key starts `on` and the third
        # character is its own uppercase form (uppercase letter,
        # digit, underscore, …). Mirrors the JS predicate.
        if (length($key) > 2 && substr($key, 0, 2) eq 'on') {
            my $c = substr($key, 2, 1);
            next if uc($c) eq $c;
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
            next unless defined $css && length $css;
            push @parts, qq{style="} . _html_escape($css) . qq{"};
            next;
        }
        my $name = _to_attr_name($key);
        push @parts, $name . qq{="} . _html_escape($val) . qq{"};
    }
    return '' unless @parts;
    # Return a Mojo::ByteStream so the calling template's `<%==`
    # raw-emit doesn't re-escape the already-escaped values.
    return b(join(' ', @parts));
}

1;
