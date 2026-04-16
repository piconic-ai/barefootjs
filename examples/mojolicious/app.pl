#!/usr/bin/env perl
use Mojolicious::Lite -signatures;
use lib '../../packages/mojolicious/lib';
use Mojo::JSON qw(true false encode_json);

# Load BarefootJS plugin
plugin 'BarefootJS';

# Serve static files (client JS, barefoot.js)
app->static->paths->[0] = app->home->child('dist');

# Serve shared styles
push @{app->static->paths}, app->home->child('../shared');

# Template directory
app->renderer->paths->[0] = app->home->child('dist/templates');

# ---------------------------------------------------------------------------
# In-memory todo storage
# ---------------------------------------------------------------------------

my @todos = (
    { id => 1, text => 'Setup project',     done => false, editing => false },
    { id => 2, text => 'Create components', done => false, editing => false },
    { id => 3, text => 'Write tests',       done => true,  editing => false },
);
my $next_id = 4;

sub reset_todos {
    @todos = (
        { id => 1, text => 'Setup project',     done => false, editing => false },
        { id => 2, text => 'Create components', done => false, editing => false },
        { id => 3, text => 'Write tests',       done => true,  editing => false },
    );
    $next_id = 4;
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
# Routes
# ---------------------------------------------------------------------------

get '/' => sub ($c) {
    $c->render(inline => <<~'HTML');
    <!DOCTYPE html>
    <html>
    <head>
        <title>BarefootJS + Mojolicious Example</title>
        <style>
            body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
            h1 { color: #333; }
            a { color: #0066cc; }
        </style>
    </head>
    <body>
        <h1>BarefootJS + Mojolicious Example</h1>
        <p>This example demonstrates server-side rendering with Mojolicious and BarefootJS.</p>
        <ul>
            <li><a href="/counter">Counter</a></li>
            <li><a href="/toggle">Toggle</a></li>
            <li><a href="/todos">Todo (@client)</a></li>
            <li><a href="/todos-ssr">Todo (no @client markers)</a></li>
            <li><a href="/ai-chat">AI Chat (SSE Streaming)</a></li>
        </ul>
    </body>
    </html>
    HTML
};

get '/counter' => sub ($c) {
    $c->render_component('Counter',
        props => { initial => 0 },
        stash => {
            count   => 0,
            initial => 0,
            doubled => 0,
        },
        heading => 'Counter Component',
    );
};

get '/toggle' => sub ($c) {
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
};

get '/form' => sub ($c) {
    $c->render_component('Form',
        props   => {},
        stash   => { accepted => 0 },
        heading => 'Form Example',
    );
};

get '/reactive-props' => sub ($c) {
    $c->render_component('ReactiveProps',
        children => { reactive_child => 'ReactiveChild' },
        props    => {},
        stash    => { count => 0, doubled => 0 },
        heading  => 'Reactive Props Test',
    );
};

get '/conditional-return' => sub ($c) {
    $c->render_component('ConditionalReturn',
        props => { variant => '' },
        stash => { variant => '', count => 0 },
        heading => 'Conditional Return Example',
    );
};

get '/conditional-return-link' => sub ($c) {
    $c->render_component('ConditionalReturn',
        props => { variant => 'link' },
        stash => { variant => 'link', count => 0 },
        heading => 'Conditional Return Example (Link)',
    );
};

get '/todos' => sub ($c) {
    my @current_todos = map { {%$_} } @todos;  # shallow copy
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
};

get '/todos-ssr' => sub ($c) {
    my @current_todos = map { {%$_} } @todos;
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
};

get '/props-reactivity' => sub ($c) {
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
};

get '/portal' => sub ($c) {
    $c->render_component('PortalExample',
        props   => {},
        stash   => { open => 0 },
        heading => 'Portal Example',
    );
};

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

get '/ai-chat' => sub ($c) {
    $c->render_component('AIChatInteractive',
        title   => 'AI Chat — SSE Streaming (Mojolicious)',
        heading => 'AI Chat — SSE Streaming',
        stash   => {
            messages      => [],
            input         => '',
            streamingText => '',
            isStreaming   => 0,
            extra_css     => '<link rel="stylesheet" href="/styles/ai-chat.css">',
        },
    );
};

get '/api/ai-chat' => sub ($c) {
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
};

# ---------------------------------------------------------------------------
# Todo API
# ---------------------------------------------------------------------------

get '/api/todos' => sub ($c) {
    $c->render(json => \@todos);
};

post '/api/todos' => sub ($c) {
    my $input = $c->req->json;
    my $todo = {
        id      => $next_id++,
        text    => $input->{text},
        done    => false,
        editing => false,
    };
    push @todos, $todo;
    $c->render(json => $todo, status => 201);
};

put '/api/todos/:id' => sub ($c) {
    my $id = $c->param('id');
    my $input = $c->req->json;
    for my $todo (@todos) {
        if ($todo->{id} == $id) {
            $todo->{text} = $input->{text} if exists $input->{text};
            $todo->{done} = $input->{done} ? true : false if exists $input->{done};
            return $c->render(json => $todo);
        }
    }
    $c->render(json => { error => 'not found' }, status => 404);
};

del '/api/todos/:id' => sub ($c) {
    my $id = $c->param('id');
    @todos = grep { $_->{id} != $id } @todos;
    $c->rendered(204);
};

post '/api/todos/reset' => sub ($c) {
    reset_todos();
    $c->rendered(200);
};

app->start;

__DATA__

@@ layouts/default.html.ep
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title><%= $title %></title>
    <link rel="stylesheet" href="/styles/components.css">
    <link rel="stylesheet" href="/styles/todo-app.css">
    % my $extra_css = stash('extra_css') // '';
    % if ($extra_css) {
    <%== $extra_css %>
    % }
    % if ($heading) {
    <style>
        body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    </style>
    % }
</head>
<body>
    % if ($heading) {
    <h1><%= $heading %></h1>
    % }
    <div id="app"><%= content %></div>
    <p><a href="/">← Back</a></p>
    <%== bf->scripts %>
</body>
</html>
