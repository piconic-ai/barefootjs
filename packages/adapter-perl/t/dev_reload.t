use Test2::V0;
use File::Temp qw(tempdir);

use BarefootJS::DevReload;

# --- browser snippet ---------------------------------------------------------
my $snip = BarefootJS::DevReload->snippet('/_bf/reload');
like $snip, qr/new EventSource\("\/_bf\/reload"\)/, 'snippet wires EventSource to the endpoint';
like $snip, qr/window\.__bfDevReload/, 'snippet is idempotent across duplicate mounts';
like $snip, qr/location\.reload\(\)/, 'snippet reloads on the `reload` event';

# --- build-id sentinel -------------------------------------------------------
my $dir  = tempdir(CLEANUP => 1);
my $path = BarefootJS::DevReload->build_id_path($dir);
like $path, qr/\.dev.+build-id$/, 'build_id_path points at <dist>/.dev/build-id';
is(BarefootJS::DevReload->read_build_id($path), '', 'missing sentinel reads as empty');

BarefootJS::DevReload->ensure_dev_dir($dir);
open my $fh, '>', $path or die $!;
print $fh "abc123\n";
close $fh;
is(BarefootJS::DevReload->read_build_id($path), 'abc123', 'sentinel is read and trimmed');

# --- PSGI streaming app ------------------------------------------------------
# Drive the streaming coderef with a fake responder/writer; break the otherwise
# infinite poll loop by throwing from write() after the initial events.
{
    package FakeWriter;
    sub new   { bless { n => 0, lines => [] }, shift }
    sub write { my ($s, $d) = @_; push @{ $s->{lines} }, $d; die "stop\n" if ++$s->{n} >= 2 }
    sub close { }
}

my $app = BarefootJS::DevReload->to_app(dist_dir => $dir);

is $app->({ 'psgi.streaming' => 0 })->[0], 500, 'requires a psgi.streaming server';

my $stream = $app->({ 'psgi.streaming' => 1, HTTP_LAST_EVENT_ID => '' });
is ref $stream, 'CODE', 'streaming response is a delayed coderef';

my $writer = FakeWriter->new;
my ($status, $headers);
$stream->(sub { ($status, $headers) = @{ $_[0] }[0, 1]; return $writer });

is $status, 200, 'streams 200';
my %h = @$headers;
is $h{'Content-Type'}, 'text/event-stream', 'SSE content-type';
my $out = join '', @{ $writer->{lines} };
like $out, qr/retry: 1000/,  'sets the SSE retry hint';
like $out, qr/event: hello/, 'emits hello with the current build-id at connect';

# A stale Last-Event-ID means a rebuild was missed → reload immediately.
my $stream2 = $app->({ 'psgi.streaming' => 1, HTTP_LAST_EVENT_ID => 'STALE' });
my $w2 = FakeWriter->new;
$stream2->(sub { return $w2 });
like join('', @{ $w2->{lines} }), qr/event: reload/, 'stale Last-Event-ID triggers reload';

done_testing;
