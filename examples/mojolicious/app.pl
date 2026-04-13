#!/usr/bin/env perl
use Mojolicious::Lite -signatures;
use lib '../../packages/mojolicious/lib';

# Load BarefootJS plugin
plugin 'BarefootJS';

# Serve static files (client JS, barefoot.js)
app->static->paths->[0] = app->home->child('dist');

# Serve shared styles
push @{app->static->paths}, app->home->child('../shared');

# Template directory
app->renderer->paths->[0] = app->home->child('dist/templates');

# ---------------------------------------------------------------------------
# Helper: set up bf and render a component
# ---------------------------------------------------------------------------

helper render_component => sub ($c, $component, %opts) {
    my $title   = $opts{title}   // "$component - BarefootJS";
    my $heading = $opts{heading} // '';
    my $stash   = $opts{stash}   // {};

    for my $key (keys %$stash) {
        $c->stash($key => $stash->{$key});
    }

    my $bf = $c->bf;
    $bf->_scope_id($component . '_' . substr(rand() =~ s/^0\.//r, 0, 6));

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
            <li><a href="/form">Form</a></li>
            <li><a href="/conditional-return">Conditional Return</a></li>
            <li><a href="/conditional-return-link">Conditional Return (Link)</a></li>
        </ul>
    </body>
    </html>
    HTML
};

get '/counter' => sub ($c) {
    $c->render_component('Counter', stash => {
        count   => 0,
        initial => 0,
        doubled => 0,
    }, heading => 'Counter Component');
};

get '/form' => sub ($c) {
    $c->render_component('Form', stash => {
        accepted => 0,
    }, heading => 'Form Example');
};

get '/conditional-return' => sub ($c) {
    $c->render_component('ConditionalReturn', stash => {
        variant => '',
        count   => 0,
    }, heading => 'Conditional Return Example');
};

get '/conditional-return-link' => sub ($c) {
    $c->render_component('ConditionalReturn', stash => {
        variant => 'link',
        count   => 0,
    }, heading => 'Conditional Return Example (Link)');
};

app->start;

__DATA__

@@ layouts/default.html.ep
<!DOCTYPE html>
<html>
<head>
    <title><%= $title %></title>
    <link rel="stylesheet" href="/styles/components.css">
    <link rel="stylesheet" href="/styles/todo-app.css">
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
