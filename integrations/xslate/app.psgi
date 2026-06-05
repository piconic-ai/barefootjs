#!/usr/bin/env perl
use strict;
use warnings;
use utf8;
use feature 'signatures';
no warnings 'experimental::signatures';

# `lib` is populated by scripts/assemble-deps.ts at build time (used in the
# container); the workspace source dirs are listed too so local dev resolves
# without the assemble step. Either location works.
use lib 'lib', '../../packages/adapter-perl/lib', '../../packages/adapter-xslate/lib';

use Plack::Request;
use Plack::Builder;
use Plack::App::File;
use JSON::PP ();

use BarefootJS;
use BarefootJS::Backend::Xslate;
use BarefootJS::DevReload;

# URL prefix the app is mounted under. Defaults to /integrations/xslate so the
# app is deploy-ready for barefootjs.dev/integrations/xslate.
my $BASE = $ENV{BASE_PATH} // '/integrations/xslate';
my $DEV  = ($ENV{PLACK_ENV} // 'development') ne 'production';

my $J = JSON::PP->new->canonical->allow_nonref->utf8;
sub jbool ($v) { $v ? JSON::PP::true : JSON::PP::false }

# One Text::Xslate backend renders every component from dist/templates. In dev
# the template cache is disabled so edits picked up by `bun run build:watch`
# render on the next request without a server restart.
my $backend = BarefootJS::Backend::Xslate->new(
    path           => ['dist/templates'],
    json_encoder   => sub ($data) { $J->encode($data) },
    xslate_options => { cache => $DEV ? 0 : 1 },
);

# ---------------------------------------------------------------------------
# Per-session in-memory todo storage (mirrors the Mojolicious example): each
# browser gets an opaque id via a $BASE-scoped cookie; %sessions keys on it so
# one visitor's list is never visible to another. LRU-bounded.
# ---------------------------------------------------------------------------
use constant {
    SESSION_COOKIE    => 'bf_session',
    SESSION_TTL_SEC   => 60 * 60 * 24 * 30,
    SESSION_STORE_MAX => 1000,
};
my %sessions;
my @session_order;

sub seed_todos () {
    return [
        { id => 1, text => 'Setup project',     done => jbool(0), editing => jbool(0) },
        { id => 2, text => 'Create components', done => jbool(0), editing => jbool(0) },
        { id => 3, text => 'Write tests',       done => jbool(1), editing => jbool(0) },
    ];
}

sub new_session_id () {
    if (open my $fh, '<:raw', '/dev/urandom') {
        read $fh, my $bytes, 16;
        close $fh;
        return unpack 'H*', $bytes if length $bytes == 16;
    }
    return sprintf '%d-%d', time, int(rand(2**31));
}

# Returns ($session, $set_cookie_header_value_or_undef).
sub get_session ($req) {
    my $id = $req->cookies->{ SESSION_COOKIE() };
    my $set_cookie;
    if (!defined $id || !length $id) {
        $id = new_session_id();
        $set_cookie = sprintf(
            '%s=%s; Path=%s; HttpOnly; SameSite=Lax; Max-Age=%d',
            SESSION_COOKIE, $id, $BASE, SESSION_TTL_SEC,
        );
    }
    if (!exists $sessions{$id}) {
        $sessions{$id} = { todos => seed_todos(), next_id => 4 };
        push @session_order, $id;
        while (@session_order > SESSION_STORE_MAX) {
            delete $sessions{ shift @session_order };
        }
    }
    else {
        @session_order = grep { $_ ne $id } @session_order;
        push @session_order, $id;
    }
    return ($sessions{$id}, $set_cookie);
}

# ---------------------------------------------------------------------------
# Rendering: build a per-request runtime, register child renderers, render the
# component template, and wrap the result in the page layout.
# ---------------------------------------------------------------------------
sub rand_suffix () { return substr(sprintf('%f', rand()) =~ s/^0\.//r, 0, 6) }

sub render_component ($component, %opts) {
    my $bf = BarefootJS->new(undef, { backend => $backend });
    my $scope_id = $component . '_' . rand_suffix();
    $bf->_scope_id($scope_id);
    $bf->_props($opts{props}) if $opts{props};

    my $children    = $opts{children}    // {};
    my $signal_init = $opts{signal_init} // {};
    for my $child_name (keys %$children) {
        my $child_template = $children->{$child_name};
        my $child_init     = $signal_init->{$child_name};
        $bf->register_child_renderer($child_name, sub ($props) {
            my $child_bf = BarefootJS->new(undef, { backend => $backend });
            # Loop children carry no _bf_slot; fall back to template + suffix so
            # each instance gets a distinct scope id (client JS finds children
            # by scope). Slot children pin to <parent>_<slot>.
            my $slot_id = delete $props->{_bf_slot};
            $child_bf->_scope_id($slot_id ? "${scope_id}_${slot_id}"
                                          : "${child_template}_" . rand_suffix());
            $child_bf->_is_child(1);
            # Share the parent's script collector so a child's register_script
            # de-dupes against the page's existing <script> set.
            $child_bf->_scripts($bf->_scripts);
            $child_bf->_script_seen($bf->_script_seen);
            my %extra = $child_init ? $child_init->($props) : ();
            return $backend->render_named($child_template, $child_bf, { %$props, %extra });
        });
    }

    my $body = $backend->render_named($component, $bf, $opts{stash} // {});
    return layout(
        title     => $opts{title}   // "$component - BarefootJS",
        heading   => $opts{heading} // '',
        body      => $body,
        scripts   => $bf->scripts,
        extra_css => $opts{extra_css} // '',
    );
}

sub layout (%a) {
    my $heading_html = $a{heading} ? "<h1>$a{heading}</h1>" : '';
    my $dev_snippet  = $DEV ? BarefootJS::DevReload->snippet("$BASE/_bf/reload") : '';
    return <<"HTML";
<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>$a{title}</title>
    <link rel="stylesheet" href="$BASE/styles/tokens.css">
    <link rel="stylesheet" href="$BASE/styles/layout.css">
    <link rel="stylesheet" href="$BASE/styles/components.css">
    <link rel="stylesheet" href="$BASE/styles/todo-app.css">
    $a{extra_css}
</head>
<body>
    <header class="bf-header">
        <div class="bf-header-inner">
            <a href="https://barefootjs.dev" class="bf-header-logo" aria-label="Barefoot.js">
                <span class="bf-header-logo-img" role="img" aria-hidden="true"></span>
            </a>
            <div class="bf-header-sep"></div>
            <nav class="bf-header-crumbs" aria-label="Breadcrumb">
                <a href="/integrations" class="bf-header-link">Integrations</a>
                <span class="bf-header-crumb-sep" aria-hidden="true">/</span>
                <span class="bf-header-current" aria-current="page">Text::Xslate</span>
            </nav>
        </div>
    </header>
    $heading_html
    <div id="app">$a{body}</div>
    <p><a href="$BASE/">&larr; Back</a></p>
    $a{scripts}
    $dev_snippet
</body>
</html>
HTML
}

sub html_response ($html, @extra_headers) {
    return [
        200,
        ['Content-Type' => 'text/html; charset=utf-8', @extra_headers],
        [ Encode_utf8($html) ],
    ];
}
sub json_response ($data, $status = 200, @extra_headers) {
    return [ $status, ['Content-Type' => 'application/json; charset=utf-8', @extra_headers], [ $J->encode($data) ] ];
}
sub Encode_utf8 ($s) { require Encode; return Encode::encode_utf8($s) }

# ---------------------------------------------------------------------------
# AI Chat dummy responses (streamed char-by-char over SSE).
# ---------------------------------------------------------------------------
my @ai_responses = (
    "[Dummy response] This text is streaming one character at a time via SSE. In production, replace /api/ai-chat with a real LLM API.",
    "[Dummy response] BarefootJS compiles JSX to Text::Xslate templates + client JS. Signals drive reactivity on any backend.",
    "[Dummy response] SSE (Server-Sent Events) lets the server push data to the client over a single HTTP connection.",
    "[Dummy response] The Xslate backend runs under any PSGI/Plack server — here Starman streams each character with a 30ms delay.",
    "[Dummy response] Out-of-Order Streaming SSR and interactive SSE streaming are two different features of BarefootJS.",
);

# ---------------------------------------------------------------------------
# Routes — PATH_INFO here is already stripped of $BASE by Plack::Builder mount.
# ---------------------------------------------------------------------------
my $routes = sub ($env) {
    my $req    = Plack::Request->new($env);
    my $path   = $req->path_info;
    $path = '/' if $path eq '';
    my $method = $req->method;

    # --- pages ---
    if ($method eq 'GET') {
        return html_response(home_page()) if $path eq '/';

        return html_response(render_component('Counter', heading => 'Counter Component'))
            if $path eq '/counter';

        if ($path eq '/toggle') {
            my $items = [
                { label => 'Setting 1', defaultOn => jbool(1) },
                { label => 'Setting 2', defaultOn => jbool(0) },
                { label => 'Setting 3', defaultOn => jbool(0) },
            ];
            return html_response(render_component('Toggle',
                heading     => 'Toggle Component',
                children    => { toggle_item => 'ToggleItem' },
                signal_init => { toggle_item => sub ($p) { (on => ($p->{defaultOn} ? 1 : 0)) } },
                props       => { toggleItems => $items },
                stash       => { toggleItems => $items },
            ));
        }

        return html_response(render_component('Form',
            heading => 'Form Example', props => {}, stash => { accepted => 0 }))
            if $path eq '/form';

        return html_response(render_component('ReactiveProps',
            heading  => 'Reactive Props Test',
            children => { reactive_child => 'ReactiveChild' },
            props    => {}, stash => { count => 0, doubled => 0 }))
            if $path eq '/reactive-props';

        if ($path eq '/conditional-return' || $path eq '/conditional-return-link') {
            my $variant = $path =~ /link/ ? 'link' : '';
            return html_response(render_component('ConditionalReturn',
                heading => 'Conditional Return Example' . ($variant ? ' (Link)' : ''),
                props   => { variant => $variant },
                stash   => { variant => $variant, count => 0 }));
        }

        if ($path eq '/todos' || $path eq '/todos-ssr') {
            my ($session, $set_cookie) = get_session($req);
            my @todos = map { {%$_} } @{ $session->{todos} };
            my $done  = grep { $_->{done} } @todos;
            my $component = $path eq '/todos-ssr' ? 'TodoAppSSR' : 'TodoApp';
            my $html = render_component($component,
                children => { todo_item => 'TodoItem' },
                props    => { initialTodos => \@todos },
                stash    => { todos => \@todos, newText => '', filter => 'all', doneCount => $done });
            return html_response($html, $set_cookie ? ('Set-Cookie' => $set_cookie) : ());
        }

        if ($path eq '/props-reactivity') {
            my $mk = sub ($p) { (displayValue => ($p->{value} // 0) * 10) };
            return html_response(render_component('PropsReactivityComparison',
                heading     => 'Props Reactivity Comparison',
                children    => { props_style_child => 'PropsStyleChild', destructured_style_child => 'DestructuredStyleChild' },
                signal_init => { props_style_child => $mk, destructured_style_child => $mk },
                props => {}, stash => { count => 1 }));
        }

        return html_response(render_component('PortalExample',
            heading => 'Portal Example', props => {}, stash => { open => 0 }))
            if $path eq '/portal';

        if ($path eq '/ai-chat') {
            return html_response(render_component('AIChatInteractive',
                title     => 'AI Chat — SSE Streaming (Text::Xslate)',
                heading   => 'AI Chat — SSE Streaming',
                stash     => { messages => [], input => '', streamingText => '', isStreaming => 0 },
                extra_css => qq{<link rel="stylesheet" href="$BASE/styles/ai-chat.css">}));
        }

        # --- todo API (GET) ---
        if ($path eq '/api/todos') {
            my ($session) = get_session($req);
            return json_response($session->{todos});
        }

        # --- AI chat SSE stream ---
        return ai_chat_stream($env) if $path eq '/api/ai-chat';
    }

    # --- todo API (writes) ---
    if ($path eq '/api/todos' && $method eq 'POST') {
        my ($session, $set_cookie) = get_session($req);
        my $input = eval { $J->decode($req->content) } // {};
        my $todo = { id => $session->{next_id}++, text => $input->{text}, done => jbool(0), editing => jbool(0) };
        push @{ $session->{todos} }, $todo;
        return json_response($todo, 201, $set_cookie ? ('Set-Cookie' => $set_cookie) : ());
    }
    if (my ($id) = $path =~ m{^/api/todos/(\d+)$}) {
        my ($session) = get_session($req);
        if ($method eq 'PUT') {
            my $input = eval { $J->decode($req->content) } // {};
            for my $todo (@{ $session->{todos} }) {
                next unless $todo->{id} == $id;
                $todo->{text} = $input->{text} if exists $input->{text};
                $todo->{done} = jbool($input->{done}) if exists $input->{done};
                return json_response($todo);
            }
            return json_response({ error => 'not found' }, 404);
        }
        if ($method eq 'DELETE') {
            $session->{todos} = [ grep { $_->{id} != $id } @{ $session->{todos} } ];
            return [204, [], []];
        }
    }
    if ($path eq '/api/todos/reset' && $method eq 'POST') {
        my ($session) = get_session($req);
        $session->{todos}   = seed_todos();
        $session->{next_id} = 4;
        return [200, ['Content-Type' => 'text/plain'], ['ok']];
    }

    return [404, ['Content-Type' => 'text/plain'], ['Not Found']];
};

sub home_page () {
    return layout(
        title   => 'BarefootJS + Text::Xslate Example',
        heading => 'BarefootJS + Text::Xslate Example',
        scripts => '',
        body    => <<"HTML",
<p>This example renders the same shared JSX components with Text::Xslate (Kolon)
under a plain Plack/PSGI app — no web framework required.</p>
<ul>
    <li><a href="$BASE/counter">Counter</a></li>
    <li><a href="$BASE/toggle">Toggle</a></li>
    <li><a href="$BASE/form">Form</a></li>
    <li><a href="$BASE/reactive-props">Reactive Props</a></li>
    <li><a href="$BASE/conditional-return">Conditional Return</a></li>
    <li><a href="$BASE/props-reactivity">Props Reactivity</a></li>
    <li><a href="$BASE/portal">Portal</a></li>
    <li><a href="$BASE/todos">Todo (\@client)</a></li>
    <li><a href="$BASE/todos-ssr">Todo (no \@client markers)</a></li>
    <li><a href="$BASE/ai-chat">AI Chat (SSE Streaming)</a></li>
</ul>
HTML
    );
}

# Char-by-char SSE stream. Streaming PSGI response with a blocking 30ms loop —
# fine under a prefork server (Starman), which the demo runs.
sub ai_chat_stream ($env) {
    return [500, ['Content-Type' => 'text/plain'], ['streaming server required']]
        unless $env->{'psgi.streaming'};
    my $text  = $ai_responses[ int(rand(@ai_responses)) ];
    my @chars = split //, $text;
    return sub ($responder) {
        my $w = $responder->([200, [
            'Content-Type'  => 'text/event-stream',
            'Cache-Control' => 'no-cache',
        ]]);
        local $SIG{PIPE} = 'IGNORE';
        eval {
            for my $ch (@chars) {
                $w->write('data: ' . $J->encode($ch) . "\n\n");
                select undef, undef, undef, 0.03;
            }
            $w->write("data: [DONE]\n\n");
            1;
        };
        $w->close;
    };
}

# ---------------------------------------------------------------------------
# PSGI app: static assets + (dev) reload endpoint + the routed app, all under
# $BASE. A bare-root request redirects into the base path.
# ---------------------------------------------------------------------------
builder {
    enable 'Plack::Middleware::ContentLength';

    mount "$BASE/client"  => Plack::App::File->new(root => 'dist/client')->to_app;
    mount "$BASE/styles"  => Plack::App::File->new(root => 'dist/styles')->to_app;

    if ($DEV) {
        mount "$BASE/_bf/reload" => BarefootJS::DevReload->to_app(dist_dir => 'dist');
    }

    mount $BASE => $routes;
    mount '/'   => sub ($env) { [302, [Location => "$BASE/"], []] };
};
