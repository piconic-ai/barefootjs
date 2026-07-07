package BarefootJS::DevReload;
our $VERSION = "0.18.1";
use strict;
use warnings;
use feature 'signatures';
no warnings 'experimental::signatures';

use File::Spec;

=head1 NAME

BarefootJS::DevReload - Framework-agnostic dev-only browser auto-reload for BarefootJS apps

=head1 SYNOPSIS

    # Plain PSGI / Plack (e.g. the Text::Xslate backend)
    use BarefootJS::DevReload;

    # Mount the SSE endpoint (dev only):
    my $reload = BarefootJS::DevReload->to_app(dist_dir => 'dist');
    # ... route '/_bf/reload' => $reload ...

    # And emit the browser snippet before </body> in your layout:
    BarefootJS::DevReload->snippet('/_bf/reload');

=head1 DESCRIPTION

Companion to C<barefoot build --watch> in C<@barefootjs/cli>. The CLI drops
C<< <dist>/.dev/build-id >> after every successful rebuild that changed output;
a browser snippet subscribes to an SSE endpoint that emits C<< event: reload >>
when that file changes, so an editor save triggers an automatic reload.

This module holds the engine-agnostic pieces — the browser snippet, the
build-id reader, and a ready-made PSGI streaming app for the SSE endpoint — so
both L<Mojolicious::Plugin::BarefootJS::DevReload> (Mojo streaming) and plain
PSGI/Plack hosts (the Text::Xslate backend) share one implementation.

=cut

# Sentinel path contract with @barefootjs/cli (DEV_SENTINEL_SUBDIR /
# DEV_SENTINEL_FILENAME in packages/cli/src/lib/build.ts). Duplicated so this
# package avoids a runtime dep on the CLI — keep in sync with the CLI.
my $DEV_SUBDIR    = '.dev';
my $BUILD_ID_FILE = 'build-id';

our $SCROLL_STORAGE_KEY = '__bf_devreload_scroll';

# Heartbeat < any reasonable proxy/IOLoop idle timeout so a quiet connection
# doesn't get reaped between rebuilds.
our $HEARTBEAT_S = 5;

# Polling instead of Linux::Inotify2 / Mac::FSEvents keeps the runtime
# dependency-free. Sub-second latency is imperceptible next to browser reload.
our $POLL_S = 0.5;

# <dist>/.dev/build-id — the sentinel `barefoot build --watch` rewrites.
sub build_id_path ($class, $dist_dir) {
    return File::Spec->catfile($dist_dir, $DEV_SUBDIR, $BUILD_ID_FILE);
}

# Ensure <dist>/.dev exists so the watcher can write the sentinel even if the
# server started first. Returns the dir.
sub ensure_dev_dir ($class, $dist_dir) {
    my $dev = File::Spec->catdir($dist_dir, $DEV_SUBDIR);
    mkdir $dev unless -d $dev;
    return $dev;
}

sub read_build_id ($class, $path) {
    return '' unless -f $path;
    open my $fh, '<', $path or return '';
    local $/;
    my $content = <$fh>;
    close $fh;
    $content //= '';
    $content =~ s/^\s+|\s+$//g;
    return $content;
}

# The browser snippet: a small IIFE — EventSource subscriber + scrollY
# preservation across reloads. Idempotent across duplicate mounts (the
# window.__bfDevReload guard). Returns a plain HTML string; callers mark it raw
# for their template engine.
sub snippet ($class, $endpoint) {
    my $ep = _js_str($endpoint);
    my $sk = _js_str($SCROLL_STORAGE_KEY);
    return qq{<script>(function(){if(window.__bfDevReload)return;window.__bfDevReload=1;try{var s=sessionStorage.getItem($sk);if(s){sessionStorage.removeItem($sk);var y=parseInt(s,10);if(!isNaN(y)){var restore=function(){window.scrollTo(0,y)};if(document.readyState==='loading'){addEventListener('DOMContentLoaded',restore,{once:true})}else{restore()}}}}catch(e){}var es=new EventSource($ep);es.addEventListener('reload',function(){try{sessionStorage.setItem($sk,String(window.scrollY))}catch(e){}location.reload()});es.addEventListener('error',function(){})})();</script>};
}

# A ready-made PSGI app for the SSE endpoint. Streams `event: reload` whenever
# <dist>/.dev/build-id changes, with `: hb` heartbeats in between.
#
# Implemented with the PSGI streaming interface and a blocking poll loop, so it
# holds one worker per open connection for the connection's lifetime — run it
# under a prefork PSGI server (Starman / Starlet) in dev, which is the natural
# choice for an app that also streams (e.g. an AI-chat SSE route). DevReload is
# automatically a no-op unless you mount it, and you should only mount it in
# development.
sub to_app ($class, %opts) {
    my $dist_dir      = $opts{dist_dir} // 'dist';
    my $build_id_path = $class->build_id_path($dist_dir);
    $class->ensure_dev_dir($dist_dir);

    return sub ($env) {
        return [500, ['Content-Type' => 'text/plain'], ['DevReload needs a psgi.streaming server']]
            unless $env->{'psgi.streaming'};

        my $last_event_id = $env->{HTTP_LAST_EVENT_ID} // '';
        $last_event_id =~ s/^\s+|\s+$//g;

        return sub ($responder) {
            my $writer = $responder->([
                200,
                [
                    'Content-Type'      => 'text/event-stream',
                    'Cache-Control'     => 'no-cache, no-transform',
                    'X-Accel-Buffering' => 'no',
                ],
            ]);

            # A write to a disconnected client throws (SIGPIPE/EPIPE); the eval
            # turns that into a clean loop exit.
            local $SIG{PIPE} = 'IGNORE';
            eval {
                $writer->write("retry: 1000\n\n");

                my $initial   = $class->read_build_id($build_id_path);
                my $last_sent = '';
                if (length $initial) {
                    $last_sent = $initial;
                    # A stale Last-Event-ID means a build happened while the
                    # client was disconnected — fire `reload` immediately so the
                    # missed rebuild doesn't stay unpainted.
                    my $event = (length $last_event_id && $last_event_id ne $initial)
                        ? 'reload' : 'hello';
                    $writer->write("event: $event\nid: $initial\ndata: $initial\n\n");
                }

                my $since_hb = 0;
                while (1) {
                    select undef, undef, undef, $POLL_S;
                    my $id = $class->read_build_id($build_id_path);
                    if (length $id && $id ne $last_sent) {
                        $last_sent = $id;
                        $since_hb  = 0;
                        $writer->write("event: reload\nid: $id\ndata: $id\n\n");
                    }
                    else {
                        $since_hb += $POLL_S;
                        if ($since_hb >= $HEARTBEAT_S) {
                            $since_hb = 0;
                            $writer->write(": hb\n\n");
                        }
                    }
                }
                1;
            };
            $writer->close;
        };
    };
}

sub _js_str ($s) {
    # Minimal JS string escape for the handful of characters that can appear in
    # a URL path or storage key. Good enough for package-internal + trusted
    # operator-supplied strings; never interpolate untrusted input here.
    my $t = $s;
    $t =~ s/\\/\\\\/g;
    $t =~ s/"/\\"/g;
    $t =~ s/\n/\\n/g;
    $t =~ s/\r/\\r/g;
    return qq{"$t"};
}

1;
