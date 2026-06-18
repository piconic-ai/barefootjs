#!/usr/bin/env perl
use Mojolicious::Lite -signatures;
# `lib` is populated by scripts/copy-plugin.pl at build time (used in the
# container); `../../packages/adapter-mojolicious/lib` is the workspace source (used
# in local dev). Both are listed so either location resolves.
use lib 'lib', '../../packages/adapter-mojolicious/lib';
use Mojo::JSON qw(true false encode_json decode_json);
use Mojo::ByteStream qw(b);
use Mojo::Util qw(xml_escape url_escape);

# Load BarefootJS plugin
plugin 'BarefootJS';

# URL prefix the app is mounted under. Defaults to /integrations/mojolicious so
# the app is deploy-ready for barefootjs.dev/integrations/mojolicious.
my $BASE_PATH = $ENV{BASE_PATH} // '/integrations/mojolicious';
app->defaults(base_path => $BASE_PATH);
# Default title so routes that render the `default` layout without setting one
# (e.g. /counter) don't trip strict-vars on `<%= $title %>` under modern
# Mojolicious. Routes that set their own title override this.
app->defaults(title => 'BarefootJS + Mojolicious Example');

# Dev-only browser auto-reload (no-op in production). The companion snippet
# is emitted in the layout below via `bf_dev_snippet`. The plugin registers
# its route at the app root, so the endpoint must include $BASE_PATH
# explicitly.
plugin 'BarefootJS::DevReload' => { endpoint => "$BASE_PATH/_bf/reload" };

# Static file roots: dist/ for generated client JS and templates; ../shared
# for design-system stylesheets shared across all example backends.
app->static->paths->[0] = app->home->child('dist');
push @{app->static->paths}, app->home->child('../shared');

# Template directory
app->renderer->paths->[0] = app->home->child('dist/templates');

# In development mode, disable template caching so edits picked up by
# `bun run build:watch` reload on each request without restarting the server.
# Production mode (MOJO_MODE=production) keeps the default cache for speed.
if (app->mode eq 'development') {
    app->renderer->cache->max_keys(0);
}

# ---------------------------------------------------------------------------
# Per-session in-memory todo storage
#
# Each browser gets an opaque session id via a cookie scoped to $BASE_PATH;
# %sessions keys on that id so one visitor's list is never visible to
# another. LRU-bounded so memory usage stays predictable.
# ---------------------------------------------------------------------------

use constant {
    SESSION_COOKIE     => 'bf_session',
    SESSION_TTL_SEC    => 60 * 60 * 24 * 30, # 30d
    SESSION_STORE_MAX  => 1000,
};

my %sessions;          # id => { todos => [...], next_id => N }
my @session_order;     # ids in access order, oldest at index 0

sub seed_todos {
    return [
        { id => 1, text => 'Setup project',     done => false, editing => false },
        { id => 2, text => 'Create components', done => false, editing => false },
        { id => 3, text => 'Write tests',       done => true,  editing => false },
    ];
}

sub new_session_id {
    # 16 bytes of /dev/urandom, hex-encoded (32 chars). Fall back to a
    # time+rand combo if urandom is unavailable — good enough for a demo.
    if (open my $fh, '<:raw', '/dev/urandom') {
        read $fh, my $bytes, 16;
        close $fh;
        return unpack 'H*', $bytes if length $bytes == 16;
    }
    return sprintf '%d-%d', time, int(rand(2 ** 31));
}

sub get_session ($c) {
    my $id = $c->cookie(SESSION_COOKIE);
    unless (defined $id && length $id && exists $sessions{$id}) {
        unless (defined $id && length $id) {
            $id = new_session_id();
            $c->cookie(
                SESSION_COOKIE,
                $id,
                {
                    path     => $BASE_PATH,
                    httponly => 1,
                    samesite => 'Lax',
                    max_age  => SESSION_TTL_SEC,
                },
            );
        }
        if (!exists $sessions{$id}) {
            $sessions{$id} = { todos => seed_todos(), next_id => 4 };
            push @session_order, $id;
            # Evict oldest if over capacity.
            while (scalar @session_order > SESSION_STORE_MAX) {
                my $oldest = shift @session_order;
                delete $sessions{$oldest};
            }
        }
    }
    else {
        # Touch LRU: move to back of access order.
        @session_order = grep { $_ ne $id } @session_order;
        push @session_order, $id;
    }
    return $sessions{$id};
}

# ---------------------------------------------------------------------------
# Helper: set up bf and render a component
# ---------------------------------------------------------------------------

helper render_component => sub ($c, $component, %opts) {
    my $title    = $opts{title}    // "$component - BarefootJS";
    my $heading  = $opts{heading}  // '';
    my $stash    = $opts{stash}    // {};
    my $children = $opts{children} // {};
    my $props    = $opts{props};     # JSON-serializable props for bf-p attribute

    for my $key (keys %$stash) {
        $c->stash($key => $stash->{$key});
    }

    my $bf = $c->bf;
    my $scope_id = $component . '_' . substr(rand() =~ s/^0\.//r, 0, 6);
    $bf->_scope_id($scope_id);

    # Set props for bf-p attribute (used by client JS for hydration)
    $bf->_props($props) if $props;

    # Register child component renderers
    my $signal_inits = $opts{signal_init} // {};
    for my $child_name (keys %$children) {
        my $child_template = $children->{$child_name};
        my $child_init = $signal_inits->{$child_name};
        $bf->register_child_renderer($child_name, sub {
            my ($props) = @_;
            my $parent_bf = $c->stash->{'bf.instance'};
            my $child_bf = BarefootJS->new($c, {});
            # Use slot ID from IR for scope (client JS uses $c(__scope, 'sN') to find children)
            # Falls back to child component name + random suffix for loop children
            my $slot_id = delete $props->{_bf_slot};
            my $child_scope = $slot_id
                ? $scope_id . '_' . $slot_id
                : $child_template . '_' . substr(rand() =~ s/^0\.//r, 0, 6);
            $child_bf->_scope_id($child_scope);
            $child_bf->_is_child(1);
            # Share script collector with parent
            $child_bf->_scripts($parent_bf->_scripts);
            $child_bf->_script_seen($parent_bf->_script_seen);

            # Compute signal/memo initial values from props
            my %extra;
            %extra = $child_init->($props) if $child_init;

            $c->stash->{'bf.instance'} = $child_bf;
            my $html = $c->render_to_string(
                template => $child_template, %$props, %extra,
            );
            $c->stash->{'bf.instance'} = $parent_bf;
            chomp $html;
            return $html;
        });
    }

    $c->stash(title => $title, heading => $heading);
    $c->render(template => $component, layout => 'default');
};

# ---------------------------------------------------------------------------
# Routes (grouped under $BASE_PATH)
# ---------------------------------------------------------------------------

my $r = app->routes->under($BASE_PATH);

# Proxy static asset URLs that include the base-path prefix into the standard
# static paths. Mojolicious's built-in static serving does not support URL
# prefixes natively, so we forward /$BASE_PATH/client/* and
# /$BASE_PATH/styles/* to reply->static.
$r->get('/client/*asset' => sub ($c) {
    $c->reply->static('client/' . ($c->stash('asset') // '')) or $c->reply->not_found;
});
$r->get('/styles/*asset' => sub ($c) {
    $c->reply->static('styles/' . ($c->stash('asset') // '')) or $c->reply->not_found;
});

$r->get('/' => sub ($c) {
    $c->stash(
        title     => 'BarefootJS + Mojolicious Example',
        heading   => 'BarefootJS + Mojolicious Example',
        back_href => '',
    );
    $c->render(template => 'home', layout => 'default');
});

$r->get('/counter' => sub ($c) {
    $c->stash(heading => 'Counter Component');
    $c->render(template => 'Counter', layout => 'default');
});

$r->get('/toggle' => sub ($c) {
    my $items = [
        { label => 'Setting 1', defaultOn => \1 },
        { label => 'Setting 2', defaultOn => \0 },
        { label => 'Setting 3', defaultOn => \0 },
    ];
    $c->render_component('Toggle',
        children    => { toggle_item => 'ToggleItem' },
        signal_init => {
            toggle_item => sub {
                my ($props) = @_;
                return (on => ($props->{defaultOn} // 0));
            },
        },
        props => { toggleItems => $items },
        stash => { toggleItems => $items },
        heading => 'Toggle Component',
    );
});

$r->get('/form' => sub ($c) {
    $c->render_component('Form',
        props   => {},
        stash   => { accepted => 0 },
        heading => 'Form Example',
    );
});

$r->get('/reactive-props' => sub ($c) {
    $c->render_component('ReactiveProps',
        children => { reactive_child => 'ReactiveChild' },
        props    => {},
        stash    => { count => 0, doubled => 0 },
        heading  => 'Reactive Props Test',
    );
});

$r->get('/conditional-return' => sub ($c) {
    $c->render_component('ConditionalReturn',
        props => { variant => '' },
        stash => { variant => '', count => 0 },
        heading => 'Conditional Return Example',
    );
});

$r->get('/conditional-return-link' => sub ($c) {
    $c->render_component('ConditionalReturn',
        props => { variant => 'link' },
        stash => { variant => 'link', count => 0 },
        heading => 'Conditional Return Example (Link)',
    );
});

$r->get('/todos' => sub ($c) {
    my $session = get_session($c);
    my @current_todos = map { {%$_} } @{ $session->{todos} };  # shallow copy
    my $done_count = scalar grep { $_->{done} } @current_todos;

    $c->render_component('TodoApp',
        children => { todo_item => 'TodoItem' },
        props    => { initialTodos => \@current_todos },
        stash    => {
            todos     => \@current_todos,
            newText   => '',
            filter    => 'all',
            doneCount => $done_count,
        },
    );
});

$r->get('/todos-ssr' => sub ($c) {
    my $session = get_session($c);
    my @current_todos = map { {%$_} } @{ $session->{todos} };
    my $done_count = scalar grep { $_->{done} } @current_todos;

    $c->render_component('TodoAppSSR',
        children => { todo_item => 'TodoItem' },
        props    => { initialTodos => \@current_todos },
        stash    => {
            todos     => \@current_todos,
            newText   => '',
            filter    => 'all',
            doneCount => $done_count,
        },
    );
});

$r->get('/props-reactivity' => sub ($c) {
    $c->render_component('PropsReactivityComparison',
        children => {
            props_style_child        => 'PropsStyleChild',
            destructured_style_child => 'DestructuredStyleChild',
        },
        signal_init => {
            props_style_child => sub {
                my ($props) = @_;
                return (displayValue => ($props->{value} // 0) * 10);
            },
            destructured_style_child => sub {
                my ($props) = @_;
                return (displayValue => ($props->{value} // 0) * 10);
            },
        },
        props   => {},
        stash   => { count => 1 },
        heading => 'Props Reactivity Comparison',
    );
});

$r->get('/portal' => sub ($c) {
    $c->render_component('PortalExample',
        props   => {},
        stash   => { open => 0 },
        heading => 'Portal Example',
    );
});

# ---------------------------------------------------------------------------
# AI Chat — SSE Streaming Example
# ---------------------------------------------------------------------------

my @ai_responses = (
    "[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
    "[Dummy response] BarefootJS compiles JSX to Mojolicious templates + client JS. Signals drive reactivity on any backend.",
    "[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
    "[Dummy response] The Mojolicious backend streams each character with a 30ms delay to simulate token-by-token LLM output.",
    "[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
);

$r->get('/ai-chat' => sub ($c) {
    $c->render_component('AIChatInteractive',
        title   => 'AI Chat — SSE Streaming (Mojolicious)',
        heading => 'AI Chat — SSE Streaming',
        stash   => {
            messages      => [],
            input         => '',
            streamingText => '',
            isStreaming   => 0,
            extra_css     => qq{<link rel="stylesheet" href="$BASE_PATH/styles/ai-chat.css">},
        },
    );
});

$r->get('/api/ai-chat' => sub ($c) {
    my $text = $ai_responses[int(rand(scalar @ai_responses))];
    my @chars = split //, $text;

    $c->res->headers->content_type('text/event-stream');
    $c->res->headers->cache_control('no-cache');
    $c->res->headers->connection('keep-alive');

    my $i = 0;
    my $timer_id;
    $c->on(finish => sub { Mojo::IOLoop->remove($timer_id) if $timer_id });
    $timer_id = Mojo::IOLoop->recurring(0.03 => sub ($loop) {
        if ($i < scalar @chars) {
            my $char = $chars[$i++];
            $c->write('data: ' . encode_json($char) . "\n\n");
        } else {
            Mojo::IOLoop->remove($timer_id);
            undef $timer_id;
            $c->write("data: [DONE]\n\n" => sub { $c->finish });
        }
    });
});

# ---------------------------------------------------------------------------
# Todo API
# ---------------------------------------------------------------------------

$r->get('/api/todos' => sub ($c) {
    my $session = get_session($c);
    $c->render(json => $session->{todos});
});

$r->post('/api/todos' => sub ($c) {
    my $session = get_session($c);
    my $input = $c->req->json;
    my $todo = {
        id      => $session->{next_id}++,
        text    => $input->{text},
        done    => false,
        editing => false,
    };
    push @{ $session->{todos} }, $todo;
    $c->render(json => $todo, status => 201);
});

$r->put('/api/todos/:id' => sub ($c) {
    my $session = get_session($c);
    my $id = $c->param('id');
    my $input = $c->req->json;
    for my $todo (@{ $session->{todos} }) {
        if ($todo->{id} == $id) {
            $todo->{text} = $input->{text} if exists $input->{text};
            $todo->{done} = $input->{done} ? true : false if exists $input->{done};
            return $c->render(json => $todo);
        }
    }
    $c->render(json => { error => 'not found' }, status => 404);
});

$r->delete('/api/todos/:id' => sub ($c) {
    my $session = get_session($c);
    my $id = $c->param('id');
    $session->{todos} = [ grep { $_->{id} != $id } @{ $session->{todos} } ];
    $c->rendered(204);
});

$r->post('/api/todos/reset' => sub ($c) {
    my $session = get_session($c);
    $session->{todos}   = seed_todos();
    $session->{next_id} = 4;
    $c->rendered(200);
});

# ---------------------------------------------------------------------------
# Blog — the @barefootjs/router showcase (mojolicious)
#
# Mirrors integrations/hono/blog.tsx: a region-shell layout (header +
# ThemeToggle in the shell, a hand-authored sidebar region `nav:0` + the
# compiled <PageShell> nested content regions in the main column) whose islands
# are the shared blog components in ../shared/blog, compiled by this
# integration's `bf build`. The client router (client/router-entry.ts, bundled
# to client/router-entry.js) swaps only the content region on navigation.
#
# Unlike Hono — where the whole page is one JSX tree — there is no server JSX
# here: the page is composed in Perl from individually-rendered island
# templates (`blog_island`), each sharing the request's script collector so
# `bf->scripts` emits the full set once.
#
# searchParams() SSR (router v0.5): the derived `params` / `visible` memos of
# PostList are not statically lowerable to a template-string adapter, so their
# SSR defaults are null (the same class of limitation the Go adapter has). We
# seed `params` from the request query (correct sort/tag labels on the server)
# and seed `visible` with the full item list as a graceful fallback; the client
# re-derives the sorted/filtered list from `searchParams()` on hydration.
# ---------------------------------------------------------------------------

my $BLOG_MANIFEST = do {
    my $f = app->home->child('dist/templates/manifest.json');
    -r $f ? decode_json($f->slurp) : {};
};
my $BLOG_DATA = do {
    my $f = app->home->child('dist/blog-data.json');
    -r $f ? decode_json($f->slurp) : { posts => [], listItems => [], allTags => [] };
};

# Blog styles — the same design-system block the Hono showcase inlines, so the
# region-shell page is self-contained (it does not use the catalog stylesheets).
my $BLOG_STYLES = <<'CSS';
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html[data-theme="light"] { color-scheme: light; }
  body { margin: 0; font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #0e1116; color: #e6edf3; }
  html[data-theme="light"] body { background: #f6f8fa; color: #1f2328; }
  a { color: #58a6ff; }
  .shell { position: sticky; top: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 24px; background: #161b22; border-bottom: 1px solid #30363d; }
  html[data-theme="light"] .shell { background: #fff; border-bottom-color: #d0d7de; }
  .shell-brand { font-weight: 700; font-size: 18px; text-decoration: none; color: inherit; }
  .shell-island { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .toggle { cursor: pointer; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 999px; padding: 5px 12px; font-size: 13px; }
  html[data-theme="light"] .toggle { background: #f6f8fa; border-color: #d0d7de; color: #1f2328; }
  .layout { display: flex; gap: 28px; align-items: flex-start; max-width: 1000px; margin: 0 auto; padding: 32px 24px 80px; }
  .layout main { flex: 1; min-width: 0; }
  .layout aside { position: sticky; top: 78px; width: 210px; flex: none; }
  html[data-theme="light"] .sidebar { background: #fff; border-color: #d0d7de; }
  .sidebar { background: #161b22; border: 1px solid #30363d; border-radius: 12px; padding: 16px; }
  .sidebar-title { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #8b949e; margin-bottom: 12px; }
  .sidebar-pin { cursor: pointer; width: 100%; background: #0d1117; border: 1px solid #30363d; color: #f2cc60; border-radius: 8px; padding: 8px 12px; font-size: 14px; font-variant-numeric: tabular-nums; }
  html[data-theme="light"] .sidebar-pin { background: #f6f8fa; border-color: #d0d7de; }
  .sidebar-note { font-size: 12px; color: #6e7681; margin: 12px 0 0; }
  @media (max-width: 720px) { .layout { flex-direction: column; } .layout aside { position: static; width: 100%; } }
  .page-title { font-size: 28px; margin: 0 0 6px; }
  .lede, .meta { color: #8b949e; }
  html[data-theme="light"] .lede, html[data-theme="light"] .meta { color: #57606a; }
  .meta { font-size: 13px; margin-bottom: 12px; }
  .lede { margin: 0 0 18px; }
  .controls, .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-bottom: 10px; }
  .ctl-label { font-size: 13px; color: #6e7681; }
  .tag, .tag-inline, .sort { text-decoration: none; font-size: 13px; color: #9aa7b4; }
  .tag, .sort { border: 1px solid #30363d; border-radius: 999px; padding: 4px 11px; }
  .tag.on, .sort.on { background: #1f6feb; border-color: #1f6feb; color: #fff; }
  .tag-inline { color: #58a6ff; }
  .status { font-size: 13px; color: #8b949e; margin-bottom: 12px; min-height: 1.2em; font-variant-numeric: tabular-nums; }
  .sortable-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  .sortable-list li { display: flex; align-items: center; gap: 10px; border: 1px solid #30363d; border-radius: 10px; background: #161b22; padding: 10px 14px; }
  html[data-theme="light"] .sortable-list li { background: #fff; border-color: #d0d7de; }
  .sortable-list li.pinned { border-color: #f2cc60; box-shadow: inset 3px 0 0 #f2cc60; }
  .pin { cursor: pointer; background: none; border: none; font-size: 16px; color: #f2cc60; padding: 0; line-height: 1; }
  .item-link { color: #e6edf3; text-decoration: none; font-weight: 600; font-size: 15px; }
  html[data-theme="light"] .item-link { color: #1f2328; }
  .item-link:hover { color: #58a6ff; }
  .item-meta { margin-left: auto; font-size: 12px; color: #6e7681; }
  .islands { display: flex; gap: 12px; align-items: center; margin: 4px 0 22px; }
  .island { font-size: 14px; }
  .island.like { cursor: pointer; background: #161b22; border: 1px solid #30363d; color: #f778ba; border-radius: 8px; padding: 6px 12px; }
  html[data-theme="light"] .island.like { background: #fff; border-color: #d0d7de; }
  .island.timer { color: #8b949e; font-variant-numeric: tabular-nums; }
  .now-playing-bar { position: fixed; left: 50%; transform: translateX(-50%); bottom: 18px; z-index: 50; display: inline-flex; align-items: center; gap: 12px; background: #161b22; border: 1px solid #30363d; border-radius: 999px; padding: 8px 16px; box-shadow: 0 8px 28px rgba(0,0,0,.45); color: #3fb950; font-size: 13px; font-variant-numeric: tabular-nums; }
  html[data-theme="light"] .now-playing-bar { background: #fff; border-color: #d0d7de; box-shadow: 0 8px 28px rgba(140,149,159,.35); }
  .np-toggle { cursor: pointer; background: none; border: none; color: inherit; font-size: 15px; padding: 0; line-height: 1; }
  .np-title { color: #8b949e; }
  .np-bar { display: inline-block; width: 120px; height: 6px; background: #30363d; border-radius: 999px; overflow: hidden; }
  html[data-theme="light"] .np-bar { background: #d0d7de; }
  .np-fill { display: block; height: 100%; background: #3fb950; transition: width .1s linear; }
  .reader-toolbar { display: flex; align-items: center; gap: 8px; margin-bottom: 18px; padding: 6px 12px; border: 1px solid #30363d; border-radius: 8px; background: #161b22; font-size: 13px; color: #8b949e; }
  html[data-theme="light"] .reader-toolbar { background: #fff; border-color: #d0d7de; }
  .rt-label { text-transform: uppercase; letter-spacing: .04em; font-size: 11px; }
  .rt-btn { cursor: pointer; background: #0d1117; border: 1px solid #30363d; color: #e6edf3; border-radius: 6px; padding: 2px 8px; font-size: 12px; }
  html[data-theme="light"] .rt-btn { background: #f6f8fa; border-color: #d0d7de; color: #1f2328; }
  .rt-level { color: #58a6ff; font-variant-numeric: tabular-nums; min-width: 1ch; text-align: center; }
  .prose p { margin: 0 0 18px; color: #d8e0e8; }
  html[data-theme="light"] .prose p { color: #424a53; }
  .back { display: inline-block; margin-bottom: 14px; text-decoration: none; font-size: 14px; }
  .pager { display: flex; justify-content: space-between; gap: 12px; margin-top: 32px; padding-top: 18px; border-top: 1px solid #30363d; }
  .pager-link { color: #58a6ff; text-decoration: none; font-weight: 600; font-size: 14px; max-width: 46%; }
  .pager-link.next { text-align: right; margin-left: auto; }
  .pager-link.disabled { color: #6e7681; }
CSS

sub _rand6 { return substr(rand() =~ s/^0\.//r, 0, 6) }

# Register a renderer for a flat (non-`ui/*`) child component the build manifest
# knows about (`post_list_item` → PostListItem, `reader_toolbar` → ReaderToolbar).
# Mirrors the closure `register_components_from_manifest` builds for UI-registry
# entries: a fresh child scope chained off the caller's slot, the shared script
# collector + renderer registry, and the manifest's ssrDefaults seeded (the
# caller's matching prop wins).
sub _register_blog_child ($c, $parent_bf, $slot, $component) {
    my $entry = $BLOG_MANIFEST->{$component} or return;
    my $defaults = $entry->{ssrDefaults};
    $parent_bf->register_child_renderer($slot, sub {
        my ($props, $caller) = @_;
        my $host = $caller // $parent_bf;
        my $host_scope = $host->_scope_id;
        my $child = BarefootJS->new($c, { backend => $parent_bf->backend });
        my $slot_id  = delete $props->{_bf_slot};
        my $data_key = delete $props->{key};
        $child->_data_key($data_key) if defined $data_key;
        $child->_scope_id($slot_id ? $host_scope . '_' . $slot_id : $component . '_' . _rand6());
        $child->_is_child(1);
        if ($slot_id) { $child->_bf_parent($host_scope); $child->_bf_mount($slot_id) }
        $child->_child_renderers($parent_bf->_child_renderers);
        $child->_scripts($parent_bf->_scripts);
        $child->_script_seen($parent_bf->_script_seen);
        my %extra = $defaults
            ? BarefootJS::_derive_stash_from_defaults($defaults, $props) : ();
        my $html = $parent_bf->backend->render_named($component, $child, { %$props, %extra });
        chomp $html;
        return $html;
    });
}

# Render a single top-level island template to an HTML string. The island gets
# its own scope id but shares the request bf's script collector + renderer
# registry, so multiple islands compose into one page and `bf->scripts` emits
# the union once.
#
#   $props    — the component's props. Serialised into `bf-p` (so the client
#               hydration sees them) AND fed to SSR as template vars. PostList's
#               `visible()` memo reactively reads `props.items`, so these MUST
#               reach the client, not just the server.
#   $extra    — SSR-only template vars: the derived memo / getter values that
#               are not statically lowerable (`params`, `visible`, the
#               sort/tag class+href scalars). The client re-derives these from
#               `searchParams()` on hydration, so they stay out of `bf-p`.
#   $children — slot key → child template to register for this island's nested
#               `render_child` calls.
helper blog_island => sub ($c, $component, $props = {}, $extra = {}, $children = {}) {
    my $root = $c->bf;
    my $bf = BarefootJS->new($c, { backend => $root->backend });
    $bf->_scope_id($component . '_' . _rand6());
    $bf->_props($props) if %$props;
    $bf->_scripts($root->_scripts);
    $bf->_script_seen($root->_script_seen);
    $bf->_child_renderers($root->_child_renderers);
    _register_blog_child($c, $bf, $_, $children->{$_}) for keys %$children;
    my $defaults = ($BLOG_MANIFEST->{$component} // {})->{ssrDefaults};
    my %seed = $defaults
        ? BarefootJS::_derive_stash_from_defaults($defaults, $props) : ();
    # `%seed` first, then props (provide `$items`/`$tags`/`$base`), then `%extra`
    # (the computed `params`/`visible`/… override the seeded nulls).
    return $root->backend->render_named($component, $bf, { %seed, %$props, %$extra });
};

# Assemble the full region-shell page around already-rendered content HTML.
sub _blog_page ($c, $title, $base, $content_html) {
    my $static = "$BASE_PATH/client";
    my $theme   = $c->blog_island('ThemeToggle');
    my $sidebar = $c->blog_island('Sidebar');
    my $shell   = $c->blog_island(
        'PageShell',
        {},                                       # no client props
        { children => b($content_html) },         # SSR-only: the page content
        { reader_toolbar => 'ReaderToolbar' },
    );
    # `searchParams()` lives in the single physical `@barefootjs/client/reactive`
    # module re-exported by every `@barefootjs/client*` entry, so the islands and
    # the router bootstrap share ONE signal instance by resolving the bare
    # specifiers to the same `barefoot.js`.
    my $importmap = encode_json({ imports => {
        '@barefootjs/client'         => "$static/barefoot.js",
        '@barefootjs/client/runtime' => "$static/barefoot.js",
        '@barefootjs/client/reactive'=> "$static/barefoot.js",
    } });
    my $scripts = $c->bf->scripts;
    my $esc_title = xml_escape($title);
    return <<"HTML";
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$esc_title</title>
<script type="importmap">$importmap</script>
<style>$BLOG_STYLES</style>
</head>
<body>
<header class="shell">
<a class="shell-brand" href="$base">\x{1F4F0} Barefoot Blog</a>
<div class="shell-island">$theme</div>
</header>
<div class="layout">
<aside bf-region="nav:0">$sidebar</aside>
<main>$shell</main>
</div>
$scripts
<script type="module" src="$static/router-entry.js"></script>
</body>
</html>
HTML
}

# The article body for a post page (hand-authored HTML, mirroring the Hono post
# route). Like / ReadingTimer / NowPlaying are pre-rendered islands spliced in.
sub _article_html ($c, $p, $i, $prev, $next, $base, $like, $timer, $now) {
    my $n = scalar @{ $BLOG_DATA->{posts} };
    my $tags_inline = CORE::join '', map {
        my $t = $_;
        my $href = "$base?tag=" . url_escape($t);
        qq{<a class="tag-inline" href="$href">#@{[ xml_escape($t) ]} </a>}
    } @{ $p->{tags} };
    my $prose = CORE::join '', map { '<p>' . xml_escape($_) . '</p>' } @{ $p->{body} };
    my $pager_prev = $prev
        ? qq{<a class="pager-link" href="$base/posts/$prev->{slug}">\x{2190} @{[ xml_escape($prev->{title}) ]}</a>}
        : qq{<span class="pager-link disabled">\x{2190} Start</span>};
    my $pager_next = $next
        ? qq{<a class="pager-link next" href="$base/posts/$next->{slug}">@{[ xml_escape($next->{title}) ]} \x{2192}</a>}
        : qq{<a class="pager-link next" href="$base">Back to start \x{2192}</a>};
    my $title = xml_escape($p->{title});
    my $date  = xml_escape($p->{date});
    my $slug  = xml_escape($p->{slug});
    my $num   = $i + 1;
    return <<"HTML";
<article class="post" data-slug="$slug">
<a class="back" href="$base">\x{2190} All posts</a>
<h1 class="page-title">$title</h1>
<div class="meta">$date \x{B7} post $num of $n \x{B7} $tags_inline</div>
<div class="islands">$like$timer</div>
$now
<div class="prose">$prose</div>
<nav class="pager">$pager_prev$pager_next</nav>
</article>
HTML
}

my $r_blog = $r;

# Index — PostList + NowPlaying in the content region. NowPlaying lives on the
# index too (data-bf-permanent) so the router moves the same live node between
# the list and a post.
$r_blog->get('/blog' => sub ($c) {
    my $sort  = $c->param('sort') // 'date';
    my $tag   = $c->param('tag')  // '';
    my $base  = "$BASE_PATH/blog";
    my $items = $BLOG_DATA->{listItems};
    my $post_list = $c->blog_island(
        'PostList',
        # Client props (→ bf-p): `visible()` re-derives from these on every
        # `searchParams()` change, so they must reach the client.
        { items => $items, tags => $BLOG_DATA->{allTags}, base => $base },
        {
            # SSR-only derived values. `params` is seeded from the request query
            # for correct server-side labels; `visible` falls back to the full
            # list (the client re-sorts/filters on hydration). The per-link sort
            # /tag class+href getters collapse to one SSR scalar each (the
            # compiler can't tell `sortClass('date')` from `sortClass('title')`
            # statically), so seed neutral defaults — the client sets the
            # correct active highlight + hrefs per link from `searchParams()`.
            params    => { sort => $sort, tag => $tag },
            visible   => $items,
            sortClass => 'sort',
            sortHref  => $base,
            tagClass  => 'tag',
            tagHref   => $base,
        },
        { post_list_item => 'PostListItem' },
    );
    my $now = $c->blog_island('NowPlaying', {}, { Math => { min => 0 } });
    my $title = length $tag ? "#$tag \x{2014} Barefoot Blog" : "Barefoot Blog \x{2014} Latest posts";
    $c->render(text => _blog_page($c, $title, $base, $post_list . $now), format => 'html');
});

$r_blog->get('/blog/posts/:slug' => sub ($c) {
    my $slug  = $c->param('slug');
    my $posts = $BLOG_DATA->{posts};
    my ($i) = grep { $posts->[$_]{slug} eq $slug } 0 .. $#$posts;
    return $c->reply->not_found unless defined $i;
    my $p    = $posts->[$i];
    my $prev = $i > 0        ? $posts->[$i - 1] : undef;
    my $next = $i < $#$posts ? $posts->[$i + 1] : undef;
    my $base = "$BASE_PATH/blog";
    my $like  = $c->blog_island('LikeButton');
    my $timer = $c->blog_island('ReadingTimer');
    my $now   = $c->blog_island('NowPlaying', {}, { Math => { min => 0 } });
    my $content = _article_html($c, $p, $i, $prev, $next, $base, $like, $timer, $now);
    $c->render(
        text   => _blog_page($c, "$p->{title} \x{2014} Barefoot Blog", $base, $content),
        format => 'html',
    );
});

app->start;

__DATA__

@@ layouts/default.html.ep
% my $bp = stash('base_path') // '';
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><%= $title %></title>
    <link rel="stylesheet" href="<%= $bp %>/styles/tokens.css">
    <link rel="stylesheet" href="<%= $bp %>/styles/layout.css">
    <link rel="stylesheet" href="<%= $bp %>/styles/components.css">
    <link rel="stylesheet" href="<%= $bp %>/styles/todo-app.css">
    % my $extra_css = stash('extra_css') // '';
    % if ($extra_css) {
    <%== $extra_css %>
    % }
</head>
<body>
    %= include 'partials/site_header'
    % if ($heading) {
    <h1><%= $heading %></h1>
    % }
    <div id="app"><%= content %></div>
    % # Subpages link back to the example list ($bp/); the list page itself
    % # passes back_href => '' to suppress the link (the header breadcrumb
    % # already navigates up to /integrations).
    % my $back_href = stash('back_href') // "$bp/";
    % if ($back_href ne '') {
    <p><a href="<%= $back_href %>">← Back</a></p>
    % }
    <%== bf->scripts %>
    <%== bf_dev_snippet %>
</body>
</html>

@@ partials/site_header.html.ep
<header class="bf-header">
    <div class="bf-header-inner">
        <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="Barefoot.js">
            <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
        </a>
        <div class="bf-header-sep"></div>
        <nav class="bf-header-crumbs" aria-label="Breadcrumb">
            <a href="/integrations" class="bf-header-link">Integrations</a>
            <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
            <span class="bf-header-current" aria-current="page">Mojolicious</span>
        </nav>
    </div>
</header>

@@ home.html.ep
% my $bp = stash('base_path') // '';
<p>This example demonstrates server-side rendering with Mojolicious and BarefootJS.</p>
<ul>
    <li><a href="<%= $bp %>/counter">Counter</a></li>
    <li><a href="<%= $bp %>/toggle">Toggle</a></li>
    <li><a href="<%= $bp %>/todos">Todo (@client)</a></li>
    <li><a href="<%= $bp %>/todos-ssr">Todo (no @client markers)</a></li>
    <li><a href="<%= $bp %>/ai-chat">AI Chat (SSE Streaming)</a></li>
</ul>
