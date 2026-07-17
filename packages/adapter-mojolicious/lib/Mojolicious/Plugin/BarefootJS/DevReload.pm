package Mojolicious::Plugin::BarefootJS::DevReload;
our $VERSION = "0.21.4";
use Mojo::Base 'Mojolicious::Plugin', -signatures;

=head1 NAME

Mojolicious::Plugin::BarefootJS::DevReload - Dev-only browser auto-reload for BarefootJS apps

=head1 SYNOPSIS

    # In your Mojolicious::Lite app (development mode)
    plugin 'BarefootJS::DevReload';

    # Then in your layout template, before </body>:
    %== bf_dev_snippet

=head1 DESCRIPTION

Companion to C<barefoot build --watch> in C<@barefootjs/cli>. The CLI drops
C<< <dist>/.dev/build-id >> after every successful rebuild that changed
output; this plugin watches that file and streams SSE C<< event: reload >>
to subscribed browsers so an editor save triggers an automatic reload.

Disabled automatically when C<< $app->mode eq 'production' >> (set via
C<MOJO_MODE=production>). Pass C<< enabled => 0 >> to disable explicitly or
C<< enabled => 1 >> to force-enable.

=cut

use Mojo::ByteStream qw(b);
use Mojo::IOLoop;
use File::Spec;
use BarefootJS::DevReload ();

# Engine-agnostic snippet, build-id reading, and timing constants are shared
# with the PSGI/Plack path in BarefootJS::DevReload — one source of truth.
my $HEARTBEAT_S = $BarefootJS::DevReload::HEARTBEAT_S;
my $POLL_S      = $BarefootJS::DevReload::POLL_S;

sub register ($self, $app, $config = {}) {
    my $dist_dir = $config->{dist_dir} // 'dist';
    my $endpoint = $config->{endpoint} // '/_bf/reload';
    my $enabled  = exists $config->{enabled}
        ? $config->{enabled}
        : ($app->mode ne 'production');

    # Snippet helper is always registered so templates don't have to branch
    # on mode — it simply returns an empty ByteStream when disabled.
    $app->helper(bf_dev_snippet => sub ($c) {
        return b('') unless $enabled;
        return b(BarefootJS::DevReload->snippet($endpoint));
    });

    return unless $enabled;

    # Resolve dist_dir relative to the Mojolicious home when not already
    # absolute, so both `dist_dir => 'dist'` (the common case) and
    # `dist_dir => '/abs/path'` (tests) work.
    my $dist_abs = File::Spec->file_name_is_absolute($dist_dir)
        ? $dist_dir
        : $app->home->child($dist_dir)->to_string;
    BarefootJS::DevReload->ensure_dev_dir($dist_abs);
    my $build_id_path = BarefootJS::DevReload->build_id_path($dist_abs);

    $app->routes->get($endpoint => sub ($c) {
        my $last_event_id = $c->req->headers->header('Last-Event-ID') // '';
        $last_event_id =~ s/^\s+|\s+$//g;

        $c->res->headers->content_type('text/event-stream');
        $c->res->headers->cache_control('no-cache, no-transform');
        $c->res->headers->connection('keep-alive');
        $c->res->headers->header('X-Accel-Buffering' => 'no');

        $c->write("retry: 1000\n\n");

        my $initial_id = BarefootJS::DevReload->read_build_id($build_id_path);
        my $last_sent  = '';
        if (length $initial_id) {
            $last_sent = $initial_id;
            # When the client reconnects with a stale Last-Event-ID, a build
            # happened during its disconnected window — fire `reload`
            # immediately so the missed rebuild does not silently stay
            # unpainted until the next change.
            my $event = (length $last_event_id && $last_event_id ne $initial_id)
                ? 'reload' : 'hello';
            $c->write("event: $event\nid: $initial_id\ndata: $initial_id\n\n");
        }

        my ($hb_id, $poll_id);
        $c->on(finish => sub {
            Mojo::IOLoop->remove($hb_id)   if $hb_id;
            Mojo::IOLoop->remove($poll_id) if $poll_id;
        });

        $hb_id = Mojo::IOLoop->recurring($HEARTBEAT_S => sub {
            $c->write(": hb\n\n");
        });
        $poll_id = Mojo::IOLoop->recurring($POLL_S => sub {
            my $id = BarefootJS::DevReload->read_build_id($build_id_path);
            return unless length $id;
            return if $id eq $last_sent;
            $last_sent = $id;
            $c->write("event: reload\nid: $id\ndata: $id\n\n");
        });
    });

    return;
}

1;
