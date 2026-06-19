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
    # Subpages link back to the example list ($BASE/); the list page itself
    # passes back => '' to suppress the link (the header breadcrumb already
    # navigates up to /integrations).
    my $back_href    = $a{back} // "$BASE/";
    my $back_html    = $back_href ne '' ? qq{<p><a href="$back_href">&larr; Back</a></p>} : '';
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
    $back_html
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
# --- page handlers: one sub per route, each returns a PSGI response ---
sub home_route ($req) { html_response(home_page()) }

sub counter_route ($req) {
    html_response(render_component('Counter', heading => 'Counter Component'));
}

sub toggle_route ($req) {
    my $items = [
        { label => 'Setting 1', defaultOn => jbool(1) },
        { label => 'Setting 2', defaultOn => jbool(0) },
        { label => 'Setting 3', defaultOn => jbool(0) },
    ];
    html_response(render_component('Toggle',
        heading     => 'Toggle Component',
        children    => { toggle_item => 'ToggleItem' },
        signal_init => { toggle_item => sub ($p) { (on => ($p->{defaultOn} ? 1 : 0)) } },
        props       => { toggleItems => $items },
        stash       => { toggleItems => $items },
    ));
}

sub form_route ($req) {
    html_response(render_component('Form',
        heading => 'Form Example', props => {}, stash => { accepted => 0 }));
}

sub reactive_props_route ($req) {
    html_response(render_component('ReactiveProps',
        heading  => 'Reactive Props Test',
        children => { reactive_child => 'ReactiveChild' },
        props    => {}, stash => { count => 0, doubled => 0 }));
}

sub conditional_return_route ($req, $suffix = '') {
    my $variant = $suffix eq '-link' ? 'link' : '';
    html_response(render_component('ConditionalReturn',
        heading => 'Conditional Return Example' . ($variant ? ' (Link)' : ''),
        props   => { variant => $variant },
        stash   => { variant => $variant, count => 0 }));
}

sub props_reactivity_route ($req) {
    my $mk = sub ($p) { (displayValue => ($p->{value} // 0) * 10) };
    html_response(render_component('PropsReactivityComparison',
        heading     => 'Props Reactivity Comparison',
        children    => { props_style_child => 'PropsStyleChild', destructured_style_child => 'DestructuredStyleChild' },
        signal_init => { props_style_child => $mk, destructured_style_child => $mk },
        props => {}, stash => { count => 1 }));
}

sub portal_route ($req) {
    html_response(render_component('PortalExample',
        heading => 'Portal Example', props => {}, stash => { open => 0 }));
}

sub ai_chat_route ($req) {
    html_response(render_component('AIChatInteractive',
        title     => 'AI Chat — SSE Streaming (Text::Xslate)',
        heading   => 'AI Chat — SSE Streaming',
        stash     => { messages => [], input => '', streamingText => '', isStreaming => 0 },
        extra_css => qq{<link rel="stylesheet" href="$BASE/styles/ai-chat.css">}));
}

sub todos_route ($req, $suffix = '') {
    my ($session, $set_cookie) = get_session($req);
    my @todos = map { {%$_} } @{ $session->{todos} };
    my $done  = grep { $_->{done} } @todos;
    my $component = $suffix eq '-ssr' ? 'TodoAppSSR' : 'TodoApp';
    my $html = render_component($component,
        children => { todo_item => 'TodoItem' },
        props    => { initialTodos => \@todos },
        stash    => { todos => \@todos, newText => '', filter => 'all', doneCount => $done });
    html_response($html, $set_cookie ? ('Set-Cookie' => $set_cookie) : ());
}

# --- todo REST API handlers ---
sub api_todos_list ($req) {
    my ($session) = get_session($req);
    json_response($session->{todos});
}

sub api_todos_create ($req) {
    my ($session, $set_cookie) = get_session($req);
    my $input = eval { $J->decode($req->content) } // {};
    my $todo = { id => $session->{next_id}++, text => $input->{text}, done => jbool(0), editing => jbool(0) };
    push @{ $session->{todos} }, $todo;
    json_response($todo, 201, $set_cookie ? ('Set-Cookie' => $set_cookie) : ());
}

sub api_todos_update ($req, $id) {
    my ($session) = get_session($req);
    my $input = eval { $J->decode($req->content) } // {};
    for my $todo (@{ $session->{todos} }) {
        next unless $todo->{id} == $id;
        $todo->{text} = $input->{text} if exists $input->{text};
        $todo->{done} = jbool($input->{done}) if exists $input->{done};
        return json_response($todo);
    }
    json_response({ error => 'not found' }, 404);
}

sub api_todos_delete ($req, $id) {
    my ($session) = get_session($req);
    $session->{todos} = [ grep { $_->{id} != $id } @{ $session->{todos} } ];
    [204, [], []];
}

sub api_todos_reset ($req) {
    my ($session) = get_session($req);
    $session->{todos}   = seed_todos();
    $session->{next_id} = 4;
    [200, ['Content-Type' => 'text/plain'], ['ok']];
}

# ---------------------------------------------------------------------------
# Blog — the @barefootjs/router showcase (Text::Xslate)
#
# Mirrors integrations/hono/blog.tsx and the Mojolicious port: a region-shell
# layout (header + ThemeToggle in the shell, a hand-authored sidebar region
# `nav:0` + the compiled <PageShell> nested content regions in the main column)
# whose islands are the shared blog components in ../shared/blog, compiled by
# this integration's `bf build`. The client router (client/router-entry.ts,
# bundled to client/router-entry.js) swaps only the content region.
#
# There is no server JSX here: the page is composed in Perl from individually-
# rendered island templates (`blog_island`), each sharing one request-scoped
# script collector (`$root`) so the page emits the union of <script> tags once.
#
# searchParams() SSR (router v0.5): PostList's derived `params` / `visible`
# memos and the per-link sort/tag getters are not statically lowerable to a
# template-string adapter (their ssrDefaults are null — the same limitation the
# Go adapter has). We seed `params` from the request query and `visible` with
# the full list, so the server renders all posts; the client re-derives the
# sorted/filtered list + active controls from `searchParams()` on hydration.
# ---------------------------------------------------------------------------
sub _slurp_json ($path) {
    open my $fh, '<:raw', $path or return undef;
    local $/;
    my $content = <$fh>;
    close $fh;
    return eval { $J->decode($content) };
}
my $BLOG_MANIFEST = _slurp_json('dist/templates/manifest.json') // {};
my $BLOG_DATA = _slurp_json('dist/blog-data.json')
    // { posts => [], listItems => [], allTags => [] };

sub _esc ($s) { return BarefootJS::_html_escape($s) }

# Register a renderer for a flat (non-`ui/*`) child component from the build
# manifest (`post_list_item` → PostListItem, `reader_toolbar` → ReaderToolbar):
# a fresh child scope chained off the caller's slot, the shared script collector
# + renderer registry, and the manifest's ssrDefaults seeded (caller prop wins).
sub _register_blog_child ($parent_bf, $slot, $component, $extra_seed = {}) {
    my $entry = $BLOG_MANIFEST->{$component} or return;
    my $defaults = $entry->{ssrDefaults};
    $parent_bf->register_child_renderer($slot, sub {
        my ($props, $caller) = @_;
        my $host = $caller // $parent_bf;
        my $host_scope = $host->_scope_id;
        my $child = BarefootJS->new(undef, { backend => $backend });
        my $slot_id  = delete $props->{_bf_slot};
        my $data_key = delete $props->{key};
        $child->_data_key($data_key) if defined $data_key;
        $child->_scope_id($slot_id ? "${host_scope}_${slot_id}"
                                   : "${component}_" . rand_suffix());
        $child->_is_child(1);
        if ($slot_id) { $child->_bf_parent($host_scope); $child->_bf_mount($slot_id) }
        $child->_child_renderers($parent_bf->_child_renderers);
        $child->_scripts($parent_bf->_scripts);
        $child->_script_seen($parent_bf->_script_seen);
        my %extra = $defaults
            ? BarefootJS::_derive_stash_from_defaults($defaults, $props) : ();
        # Per-child SSR seeds the static extractor can't supply (e.g. NowPlaying's
        # `Math` → `{ min => 0 }` for the progress-bar width).
        return $backend->render_named($component, $child, { %extra, %$extra_seed, %$props });
    });
}

# Render one top-level island to an HTML string, sharing `$root`'s script
# collector + renderer registry so islands compose into one page.
#   $props    — props (→ bf-p, so the client hydration sees them, AND template vars)
#   $extra    — SSR-only template vars (derived memo / getter values not lowered)
#   $children — slot key → child template to register for nested render_child
sub blog_island ($root, $component, $props = {}, $extra = {}, $children = {}) {
    my $bf = BarefootJS->new(undef, { backend => $backend });
    $bf->_scope_id($component . '_' . rand_suffix());
    $bf->_props($props) if %$props;
    $bf->_scripts($root->_scripts);
    $bf->_script_seen($root->_script_seen);
    $bf->_child_renderers($root->_child_renderers);
    # Each child is `slot => 'Template'` or `slot => ['Template', \%extra_seed]`.
    for my $slot (keys %$children) {
        my $spec = $children->{$slot};
        my ($tpl, $seed) = ref($spec) eq 'ARRAY' ? @$spec : ($spec, {});
        _register_blog_child($bf, $slot, $tpl, $seed);
    }
    my $defaults = ($BLOG_MANIFEST->{$component} // {})->{ssrDefaults};
    my %seed = $defaults
        ? BarefootJS::_derive_stash_from_defaults($defaults, $props) : ();
    return $backend->render_named($component, $bf, { %seed, %$props, %$extra });
}

# Assemble the region-shell page around already-rendered content HTML. `$root`
# is the request-scoped runtime whose script collector the content islands (and
# the shell islands rendered here) all share.
sub blog_page ($root, $title, $base, $content_html) {
    my $static    = "$BASE/client";
    my $theme     = blog_island($root, 'ThemeToggle');
    my $sidebar   = blog_island($root, 'Sidebar');
    my $shell     = blog_island($root, 'PageShell',
        {},                                                # no client props
        { children => $backend->mark_raw($content_html) }, # SSR-only: page content
        { reader_toolbar => 'ReaderToolbar' });
    my $importmap = $J->encode({ imports => {
        '@barefootjs/client'          => "$static/barefoot.js",
        '@barefootjs/client/runtime'  => "$static/barefoot.js",
        '@barefootjs/client/reactive' => "$static/barefoot.js",
    } });
    my $scripts   = $root->scripts;
    my $esc_title = _esc($title);
    return <<"HTML";
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>$esc_title</title>
<script type="importmap">$importmap</script>
<link rel="stylesheet" href="$BASE/styles/blog.css">
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

sub blog_index_route ($req) {
    my $root  = BarefootJS->new(undef, { backend => $backend });
    my $base  = "$BASE/blog";
    my $sort  = $req->query_parameters->{sort} // 'date';
    my $tag   = $req->query_parameters->{tag}  // '';
    my $items = $BLOG_DATA->{listItems};
    my $post_list = blog_island($root, 'PostList',
        # Client props (→ bf-p): `visible()` re-derives from these on every
        # `searchParams()` change, so they must reach the client.
        { items => $items, tags => $BLOG_DATA->{allTags}, base => $base },
        {
            # SSR-only derived values. `params` from the request query (correct
            # server-side labels); `visible` falls back to the full list. The
            # per-link sort/tag class+href getters collapse to one SSR scalar
            # each (the compiler can't tell `sortClass('date')` from
            # `sortClass('title')` statically), so seed neutral defaults — the
            # client sets the correct active highlight + hrefs from searchParams.
            params    => { sort => $sort, tag => $tag },
            visible   => $items,
            sortClass => 'sort',
            sortHref  => $base,
            tagClass  => 'tag',
            tagHref   => $base,
        },
        { post_list_item => 'PostListItem' });
    my $now = blog_island($root, 'NowPlaying', {}, { Math => { min => 0 } });
    my $title = length $tag ? "#$tag \x{2014} Barefoot Blog" : "Barefoot Blog \x{2014} Latest posts";
    html_response(blog_page($root, $title, $base, $post_list . $now));
}

sub blog_post_route ($req, $slug) {
    # Sort newest-first (the index's default display order) so the article pager
    # walks down the list the reader is browsing; the corpus is authored oldest-first.
    my $posts = [ sort { $b->{date} cmp $a->{date} } @{ $BLOG_DATA->{posts} } ];
    my ($i) = grep { $posts->[$_]{slug} eq $slug } 0 .. $#$posts;
    return [404, ['Content-Type' => 'text/plain'], ['Not Found']] unless defined $i;
    my $p    = $posts->[$i];
    my $prev = $i > 0        ? $posts->[$i - 1] : undef;
    my $next = $i < $#$posts ? $posts->[$i + 1] : undef;
    my $base = "$BASE/blog";
    my $root = BarefootJS->new(undef, { backend => $backend });
    # The whole article is the shared <PostArticle> island; the interactive
    # widgets are its nested children (NowPlaying needs Math seeded).
    my $content = blog_island($root, 'PostArticle',
        {
            slug => $p->{slug}, title => $p->{title}, date => $p->{date},
            tags => $p->{tags}, body => $p->{body},
            position => $i + 1, total => scalar(@$posts), base => $base,
            prevSlug  => $prev ? $prev->{slug}  : undef,
            prevTitle => $prev ? $prev->{title} : undef,
            nextSlug  => $next ? $next->{slug}  : undef,
            nextTitle => $next ? $next->{title} : undef,
        },
        {},
        {
            like_button   => 'LikeButton',
            reading_timer => 'ReadingTimer',
            now_playing   => [ 'NowPlaying', { Math => { min => 0 } } ],
        });
    html_response(blog_page($root, "$p->{title} \x{2014} Barefoot Blog", $base, $content));
}

# Route table: [ METHOD, path pattern, handler ]. First match wins; any regex
# captures (e.g. /api/todos/(\d+), /todos(-ssr)?) are passed to the handler
# after the request.
my @ROUTES = (
    [ GET    => qr{^/blog$}                       => \&blog_index_route ],
    [ GET    => qr{^/blog/posts/([^/]+)$}         => \&blog_post_route ],
    [ GET    => qr{^/$}                           => \&home_route ],
    [ GET    => qr{^/counter$}                    => \&counter_route ],
    [ GET    => qr{^/toggle$}                     => \&toggle_route ],
    [ GET    => qr{^/form$}                       => \&form_route ],
    [ GET    => qr{^/reactive-props$}             => \&reactive_props_route ],
    [ GET    => qr{^/conditional-return(-link)?$} => \&conditional_return_route ],
    [ GET    => qr{^/props-reactivity$}           => \&props_reactivity_route ],
    [ GET    => qr{^/portal$}                     => \&portal_route ],
    [ GET    => qr{^/todos(-ssr)?$}               => \&todos_route ],
    [ GET    => qr{^/ai-chat$}                    => \&ai_chat_route ],
    [ GET    => qr{^/api/todos$}                  => \&api_todos_list ],
    [ POST   => qr{^/api/todos$}                  => \&api_todos_create ],
    [ POST   => qr{^/api/todos/reset$}            => \&api_todos_reset ],
    [ PUT    => qr{^/api/todos/(\d+)$}            => \&api_todos_update ],
    [ DELETE => qr{^/api/todos/(\d+)$}            => \&api_todos_delete ],
    [ GET    => qr{^/api/ai-chat$}                => \&ai_chat_stream ],
);

my $routes = sub ($env) {
    my $req    = Plack::Request->new($env);
    my $method = $req->method;
    my $path   = $req->path_info;
    $path = '/' if $path eq '';

    for my $route (@ROUTES) {
        my ($m, $pattern, $handler) = @$route;
        next if $method ne $m;
        next unless $path =~ $pattern;
        # @{^CAPTURE} holds just this match's capture groups (empty for none).
        return $handler->($req, @{^CAPTURE});
    }
    return [404, ['Content-Type' => 'text/plain'], ['Not Found']];
};

sub home_page () {
    return layout(
        title   => 'BarefootJS + Text::Xslate Example',
        heading => 'BarefootJS + Text::Xslate Example',
        back    => '',
        scripts => '',
        body    => <<"HTML",
<p>This example renders the same shared JSX components with Text::Xslate (Kolon)
under a plain Plack/PSGI app — no web framework required.</p>
<ul>
    <li><a href="$BASE/counter">Counter</a></li>
    <li><a href="$BASE/toggle">Toggle</a></li>
    <li><a href="$BASE/todos">Todo (\@client)</a></li>
    <li><a href="$BASE/todos-ssr">Todo (no \@client markers)</a></li>
    <li><a href="$BASE/ai-chat">AI Chat (SSE Streaming)</a></li>
    <li><a href="$BASE/blog">Blog (\@barefootjs/router - partial navigation)</a></li>
</ul>
HTML
    );
}

# Char-by-char SSE stream. Streaming PSGI response with a blocking 30ms loop —
# fine under a prefork server (Starman), which the demo runs.
sub ai_chat_stream ($req) {
    my $env = $req->env;
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
