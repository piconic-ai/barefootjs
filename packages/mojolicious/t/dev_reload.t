use strict;
use warnings;
use feature 'signatures';
no warnings 'experimental::signatures';

use Test::More;
use Test::Mojo;
use Mojolicious::Lite;
use File::Temp qw(tempdir);
use File::Path qw(make_path);
use File::Spec;
use FindBin qw($Bin);
use lib "$Bin/../lib";
use Mojo::Server::Daemon;
use IO::Socket::INET;

# Spin up a real daemon on an ephemeral port and collect bytes via a raw
# socket read with a short timeout. Going through Mojo::UserAgent against an
# infinite SSE stream tends to hang because the UA's blocking start() waits
# for tx completion.
sub read_sse ($app, $path, %opts) {
    my $headers = $opts{headers} // {};

    my $daemon = Mojo::Server::Daemon->new(
        app    => $app,
        listen => ['http://127.0.0.1'],
        silent => 1,
    );
    $daemon->start;
    my $port = $daemon->ioloop->acceptor($daemon->acceptors->[0])->port;

    my $sock = IO::Socket::INET->new(
        PeerAddr => '127.0.0.1',
        PeerPort => $port,
        Proto    => 'tcp',
        Timeout  => 2,
    ) or die "socket: $!";
    $sock->autoflush(1);

    my $req = "GET $path HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n";
    for my $k (keys %$headers) {
        $req .= "$k: $headers->{$k}\r\n";
    }
    $req .= "\r\n";
    print $sock $req;

    # Pump the IOLoop until bytes arrive or the read deadline passes.
    my $raw = '';
    my $deadline = time + 2;
    $sock->blocking(0);
    while (time < $deadline && length($raw) < 400) {
        Mojo::IOLoop->one_tick;
        my $chunk = '';
        my $bytes = sysread($sock, $chunk, 4096);
        if (defined $bytes && $bytes > 0) {
            $raw .= $chunk;
        }
    }
    close $sock;
    $daemon->stop;

    # Split off headers; keep only the body (the bytes after the first
    # CRLFCRLF). Chunked transfer-encoding inserts size lines + CRLFs around
    # each chunk; we just match substrings so that's fine for our asserts.
    my ($head, $body) = split /\r\n\r\n/, $raw, 2;
    $body //= '';
    my $status = ($head // '') =~ m{^HTTP/\d+\.\d+ (\d+)} ? $1 : 0;
    my %resp_headers;
    for my $line (split /\r\n/, $head // '') {
        next unless $line =~ m{^([^:]+):\s*(.*)$};
        $resp_headers{lc $1} = $2;
    }

    diag "SSE status=$status body=\n$body\n" if $ENV{DEBUG_SSE};
    return { status => $status, headers => \%resp_headers, body => $body };
}

# Build a minimal Mojolicious::Lite app with the DevReload plugin and a
# configurable dist dir so tests can pre-seed the sentinel file.
sub build_app ($dist_dir, %plugin_opts) {
    my $app = Mojolicious::Lite->new;
    $app->plugin('BarefootJS::DevReload',
        { dist_dir => $dist_dir, %plugin_opts });
    my $t = Test::Mojo->new($app);
    # SSE endpoint streams forever; cap response + inactivity so streaming
    # tests don't hang. Applies to all tests using this app; harmless for
    # the non-streaming ones.
    $t->ua->max_response_size(4096);
    $t->ua->inactivity_timeout(2);
    return $t;
}

sub write_sentinel ($dist, $id) {
    my $dir = File::Spec->catdir($dist, '.dev');
    make_path($dir);
    open my $fh, '>', File::Spec->catfile($dir, 'build-id') or die $!;
    print $fh $id;
    close $fh;
}

subtest 'snippet helper returns script tag when enabled' => sub {
    my $dist = tempdir(CLEANUP => 1);
    my $t    = build_app($dist, enabled => 1);
    my $out  = $t->app->build_controller->bf_dev_snippet;
    like "$out", qr{<script>},                  'has <script>';
    like "$out", qr{new EventSource\("/_bf/reload"\)}, 'default endpoint';
    like "$out", qr{addEventListener\('reload'},       'reload listener';
};

subtest 'snippet helper empty when disabled' => sub {
    my $dist = tempdir(CLEANUP => 1);
    my $t    = build_app($dist, enabled => 0);
    my $out  = $t->app->build_controller->bf_dev_snippet;
    is "$out", '', 'empty string';
};

subtest '/_bf/reload returns 404 when disabled' => sub {
    my $dist = tempdir(CLEANUP => 1);
    my $t    = build_app($dist, enabled => 0);
    $t->get_ok('/_bf/reload')->status_is(404);
};

subtest '/_bf/reload streams SSE headers and initial hello' => sub {
    my $dist = tempdir(CLEANUP => 1);
    write_sentinel($dist, '1234567890');
    my $t = build_app($dist, enabled => 1);

    my $r = read_sse($t->app, '/_bf/reload');
    is $r->{status}, 200, 'status 200';
    is $r->{headers}{'content-type'}, 'text/event-stream', 'content type';
    is $r->{headers}{'cache-control'}, 'no-cache, no-transform', 'cache-control';
    like $r->{body}, qr/retry: 1000/,      'retry frame present';
    like $r->{body}, qr/event: hello/,     'hello event emitted';
    like $r->{body}, qr/data: 1234567890/, 'current build-id in data';
};

# Regression: a client reconnecting with a stale Last-Event-ID must see
# `reload` (not `hello`), otherwise the build fired during its disconnected
# window stays unpainted until the next change.
subtest 'stale Last-Event-ID yields reload on reconnect' => sub {
    my $dist = tempdir(CLEANUP => 1);
    write_sentinel($dist, 'B');
    my $t = build_app($dist, enabled => 1);

    my $r = read_sse(
        $t->app, '/_bf/reload',
        headers => { 'Last-Event-ID' => 'A' },
    );
    is $r->{status}, 200, 'status 200';
    like   $r->{body}, qr/event: reload/, 'reload on stale id';
    unlike $r->{body}, qr/event: hello/,  'no hello on stale id';
    like   $r->{body}, qr/data: B/,       'current build-id in data';
};

subtest 'custom endpoint is honored in snippet + route' => sub {
    my $dist = tempdir(CLEANUP => 1);
    write_sentinel($dist, 'X');
    my $t = build_app($dist, enabled => 1, endpoint => '/__reload');

    my $out = $t->app->build_controller->bf_dev_snippet;
    like "$out", qr{new EventSource\("/__reload"\)}, 'snippet uses custom endpoint';

    my $r = read_sse($t->app, '/__reload');
    is $r->{status}, 200, 'custom endpoint live';
    is $r->{headers}{'content-type'}, 'text/event-stream', 'content type';

    $t->get_ok('/_bf/reload')->status_is(404, 'default endpoint disabled');
};

done_testing;
