#!/usr/bin/env perl
use Mojolicious::Lite -signatures;
# `lib` is populated by scripts/copy-plugin.pl at build time (used in the
# container); `../../packages/mojolicious/lib` is the workspace source (used
# in local dev). Both are listed so either location resolves.
use lib 'lib', '../../packages/mojolicious/lib';
use Mojo::JSON qw(true false encode_json);

# Load BarefootJS plugin
plugin 'BarefootJS';

# URL prefix the app is mounted under. Defaults to /integrations/mojolicious so
# the app is deploy-ready for barefootjs.dev/integrations/mojolicious.
my $BASE_PATH = $ENV{BASE_PATH} // '/integrations/mojolicious';
app->defaults(base_path => $BASE_PATH);

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
        title   => 'BarefootJS + Mojolicious Example',
        heading => 'BarefootJS + Mojolicious Example',
    );
    $c->render(template => 'home', layout => 'default');
});

$r->get('/counter' => sub ($c) {
    $c->render_component('Counter',
        props => { initial => 0 },
        stash => {
            count   => 0,
            initial => 0,
            doubled => 0,
        },
        heading => 'Counter Component',
    );
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
    <p><a href="<%= $bp %>/">← Back</a></p>
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
        <a href="/integrations" class="bf-header-link">Integrations</a>
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
