package Mojolicious::Plugin::BarefootJS::DevReload;
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

# Sentinel path contract with @barefootjs/cli (DEV_SENTINEL_SUBDIR /
# DEV_SENTINEL_FILENAME in packages/cli/src/lib/build.ts). Duplicated so this
# package avoids a runtime dep on the CLI — keep in sync with the CLI.
my $DEV_SUBDIR         = '.dev';
my $BUILD_ID_FILE      = 'build-id';
my $SCROLL_STORAGE_KEY = '__bf_devreload_scroll';

# Heartbeat < any reasonable proxy/IOLoop idle timeout so a quiet connection
# doesn't get reaped between rebuilds.
my $HEARTBEAT_S = 5;

# Polling instead of Linux::Inotify2 / Mac::FSEvents keeps the runtime
# dependency-free. Sub-second latency is imperceptible next to browser reload.
my $POLL_S = 0.5;

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
        return b(_snippet($endpoint));
    });

    return unless $enabled;

    # Resolve dist_dir relative to the Mojolicious home when not already
    # absolute, so both `dist_dir => 'dist'` (the common case) and
    # `dist_dir => '/abs/path'` (tests) work.
    my $dist_abs = File::Spec->file_name_is_absolute($dist_dir)
        ? $dist_dir
        : $app->home->child($dist_dir)->to_string;
    my $dev_dir       = File::Spec->catdir($dist_abs, $DEV_SUBDIR);
    my $build_id_path = File::Spec->catfile($dev_dir, $BUILD_ID_FILE);
    mkdir $dev_dir unless -d $dev_dir;

    $app->routes->get($endpoint => sub ($c) {
        my $last_event_id = $c->req->headers->header('Last-Event-ID') // '';
        $last_event_id =~ s/^\s+|\s+$//g;

        $c->res->headers->content_type('text/event-stream');
        $c->res->headers->cache_control('no-cache, no-transform');
        $c->res->headers->connection('keep-alive');
        $c->res->headers->header('X-Accel-Buffering' => 'no');

        $c->write("retry: 1000\n\n");

        my $initial_id = _read_build_id($build_id_path);
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
            my $id = _read_build_id($build_id_path);
            return unless length $id;
            return if $id eq $last_sent;
            $last_sent = $id;
            $c->write("event: reload\nid: $id\ndata: $id\n\n");
        });
    });

    return;
}

sub _read_build_id ($path) {
    return '' unless -f $path;
    open my $fh, '<', $path or return '';
    local $/;
    my $content = <$fh>;
    close $fh;
    $content //= '';
    $content =~ s/^\s+|\s+$//g;
    return $content;
}

sub _snippet ($endpoint) {
    my $ep = _js_str($endpoint);
    my $sk = _js_str($SCROLL_STORAGE_KEY);
    # Small IIFE: EventSource subscriber + scrollY preservation. Idempotent
    # across duplicate mounts (window.__bfDevReload guard).
    return qq{<script>(function(){if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem($sk);if(s){sessionStorage.removeItem($sk);var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource($ep);es.addEventListener('reload',function(){try{sessionStorage.setItem($sk,String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();</script>};
}

sub _js_str ($s) {
    # Minimal JS string escape for the handful of characters that can appear
    # in a URL path or storage key. Good enough for package-internal + trusted
    # operator-supplied strings; never interpolate untrusted input here.
    my $t = $s;
    $t =~ s/\\/\\\\/g;
    $t =~ s/"/\\"/g;
    $t =~ s/\n/\\n/g;
    $t =~ s/\r/\\r/g;
    return qq{"$t"};
}

1;
