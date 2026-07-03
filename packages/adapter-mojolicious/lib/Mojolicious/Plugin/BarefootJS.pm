package Mojolicious::Plugin::BarefootJS;
our $VERSION = "0.17.1";
use Mojo::Base 'Mojolicious::Plugin', -signatures;

use Mojo::File qw(path);
use Mojo::JSON qw(decode_json);

use BarefootJS;

# Plugin entry point. Wires up:
#
#   1. The `bf` controller helper. Lazily instantiates one
#      BarefootJS object per request and stashes it under
#      `bf.instance`.
#
#   2. A `before_render` hook that, when the rendered template name
#      matches a top-level component in the build manifest, fills the
#      heavy boilerplate the user previously hand-rolled in `app.pl`:
#      generates the scope id, registers every UI-registry child
#      renderer from the manifest, and seeds the stash with each
#      template variable's static default (issue #1416).
#
# Configuration (all optional):
#   - manifest_path: absolute path to the `bf build`-emitted
#     `manifest.json`. Defaults to `<app->home>/dist/templates/manifest.json`.
#     Pass `undef` to disable manifest-driven auto-init entirely; the
#     bf helper is still installed and callers can drive everything
#     manually as before.
sub register ($self, $app, $config = {}) {
    $app->helper(bf => sub ($c) {
        $c->stash->{'bf.instance'} //= BarefootJS->new($c, $config);
    });

    my $manifest = _load_manifest($app, $config);
    return unless $manifest;

    # Cache the set of UI-registry slot keys so we can answer
    # "is this template name a child or a top-level page?" with a
    # single hash lookup at render time. Top-level entries are
    # everything that isn't `__barefoot__` and doesn't match
    # `ui/<name>/index` — the same partition `register_components_from_manifest`
    # applies internally.
    my %is_child_entry;
    for my $entry_name (keys %$manifest) {
        next if $entry_name eq '__barefoot__';
        next unless $entry_name =~ m{^ui/[^/]+/index$};
        $is_child_entry{$entry_name} = 1;
    }

    $app->hook(before_render => sub ($c, $args) {
        my $template = $args->{template};
        return unless defined $template && length $template;
        my $entry = $manifest->{$template};
        return unless $entry;
        return if $is_child_entry{$template};
        # Idempotency guard for nested renders. A controller might
        # call `render_to_string` inside an action and then `render`
        # — without this we'd re-init `bf` on the second pass and
        # wipe the script registrations the first pass collected.
        return if $c->stash->{'bf.auto_init_done'};

        # Escape hatch for callers that wire `bf` up by hand (the
        # existing `render_component` helper in the showcase app does
        # this). If `_scope_id` is already set we treat the request as
        # "manually managed" and leave it alone — same outcome as
        # before the plugin gained auto-init.
        my $bf = $c->bf;
        if (defined $bf->_scope_id && length $bf->_scope_id) {
            $c->stash->{'bf.auto_init_done'} = 1;
            return;
        }
        $c->stash->{'bf.auto_init_done'} = 1;

        $bf->_scope_id($template . '_' . substr(rand() =~ s/^0\.//r, 0, 6));
        $bf->register_components_from_manifest($manifest);

        # Seed each ssrDefault into the stash unless the caller has
        # already supplied a value for that key — callers always win.
        my $defaults = $entry->{ssrDefaults};
        if (ref($defaults) eq 'HASH') {
            for my $name (keys %$defaults) {
                next if exists $c->stash->{$name};
                my $d = $defaults->{$name};
                my $value = ref($d) eq 'HASH' ? $d->{value} : $d;
                $c->stash->{$name} = $value;
            }
        }

        # (#1922) Seed the request-scoped `searchParams()` reader as the
        # `$searchParams` template var, built from the live request query —
        # so `searchParams().get(k)` resolves the current query during SSR
        # (the client re-reads window.location on hydration). A caller that
        # set it by hand wins (`//=`). Harmless for components that never read
        # it; the var simply goes unused. `$bf->search_params` lazy-loads the
        # reader class, so the plugin needn't `use` it directly.
        $c->stash->{searchParams} //=
            $bf->search_params($c->req->query_params->to_string);
    });
}

sub _load_manifest ($app, $config) {
    return undef if exists $config->{manifest_path} && !defined $config->{manifest_path};
    my $manifest_path = $config->{manifest_path}
        // $app->home->child('dist/templates/manifest.json');
    my $file = path($manifest_path);
    return undef unless -r $file;
    my $manifest = eval { decode_json($file->slurp) };
    if ($@ || ref($manifest) ne 'HASH') {
        $app->log->warn("BarefootJS: cannot parse manifest at $file: $@") if $@;
        return undef;
    }
    return $manifest;
}

1;
__END__

=encoding utf8

=head1 NAME

Mojolicious::Plugin::BarefootJS - Mojolicious integration for BarefootJS

=head1 SYNOPSIS

    # Mojolicious application
    $self->plugin('BarefootJS');

    # In a controller / template, the `bf` helper exposes a per-request
    # BarefootJS runtime backed by BarefootJS::Backend::Mojo.

=head1 DESCRIPTION

Wires the L<BarefootJS> server runtime into L<Mojolicious>. It registers a
C<bf> controller helper that lazily instantiates one BarefootJS object per
request (rendering via L<BarefootJS::Backend::Mojo>), and supports rendering
compiled marked templates as Mojolicious templates.

For non-Mojolicious / PSGI hosts, see L<BarefootJS::Backend::Xslate>, which
drives the same runtime with Text::Xslate and no web framework.

=head1 METHODS

L<Mojolicious::Plugin::BarefootJS> inherits all methods from
L<Mojolicious::Plugin> and implements the following new one.

=head2 register

    $plugin->register(Mojolicious->new, \%conf);

Registers the plugin (the C<bf> helper and supporting hooks) in a Mojolicious
application.

=head1 SEE ALSO

L<BarefootJS>, L<BarefootJS::Backend::Mojo>, L<BarefootJS::Backend::Xslate>,
L<Mojolicious>, L<https://github.com/piconic-ai/barefootjs>

=head1 AUTHOR

kobaken E<lt>kentafly88@gmail.comE<gt>

=head1 LICENSE

Copyright (c) 2025-present BarefootJS Contributors.

This library is free software; you can redistribute it and/or modify it under
the MIT License. See the F<LICENSE> file in the distribution for the full text.

=cut
