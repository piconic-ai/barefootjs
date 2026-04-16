package BarefootJS;
use Mojo::Base -base, -signatures;

use Mojo::ByteStream qw(b);
use Mojo::JSON qw(encode_json to_json);

has 'c';       # Mojolicious controller
has 'config';  # Plugin config

# Internal state
has '_scripts' => sub { [] };
has '_script_seen' => sub { {} };
has '_scope_id';
has '_is_child' => 0;
has '_props';

sub new ($class, $c, $config = {}) {
    return $class->SUPER::new(
        c      => $c,
        config => $config,
    );
}

# ---------------------------------------------------------------------------
# Scope & Props
# ---------------------------------------------------------------------------

sub scope_attr ($self) {
    my $scope_id = $self->_scope_id // '';
    return $self->_is_child ? "~$scope_id" : $scope_id;
}

sub props_attr ($self) {
    my $props = $self->_props;
    return '' unless $props && %$props;
    # to_json returns a character string (not bytes) for safe embedding in templates
    my $json = to_json($props);
    return qq{ bf-p='$json'};
}

# ---------------------------------------------------------------------------
# Comment Markers
# ---------------------------------------------------------------------------

sub comment ($self, $text) {
    return "<!--bf-$text-->";
}

sub text_start ($self, $slot_id) {
    return "<!--bf:$slot_id-->";
}

sub text_end ($self) {
    return "<!--/-->";
}

sub scope_comment ($self) {
    my $scope_id = $self->scope_attr;
    my $props_json = '';
    if ($self->_props && %{$self->_props}) {
        $props_json = '|' . to_json($self->_props);
    }
    return "<!--bf-scope:$scope_id$props_json-->";
}

# ---------------------------------------------------------------------------
# Script Registration
# ---------------------------------------------------------------------------

sub register_script ($self, $path) {
    return if $self->_script_seen->{$path};
    $self->_script_seen->{$path} = 1;
    push @{$self->_scripts}, $path;
}

# ---------------------------------------------------------------------------
# Child Component Rendering
# ---------------------------------------------------------------------------

has '_child_renderers' => sub { {} };

sub register_child_renderer ($self, $name, $renderer) {
    $self->_child_renderers->{$name} = $renderer;
}

sub render_child ($self, $name, %props) {
    my $renderer = $self->_child_renderers->{$name};
    die "No renderer registered for child component '$name'" unless $renderer;
    return $renderer->(\%props);
}

# ---------------------------------------------------------------------------
# Script Output
# ---------------------------------------------------------------------------

sub scripts ($self) {
    my @tags;
    for my $path (@{$self->_scripts}) {
        push @tags, qq{<script type="module" src="$path"></script>};
    }
    return join("\n", @tags);
}

# ---------------------------------------------------------------------------
# Streaming SSR (Out-of-Order)
# ---------------------------------------------------------------------------

sub streaming_bootstrap ($self) {
    return q{<script>(function(){function s(id){var a=document.querySelector('[bf-async="'+id+'"]');var t=document.querySelector('template[bf-async-resolve="'+id+'"]');if(!a||!t)return;a.replaceChildren(t.content.cloneNode(true));a.removeAttribute('bf-async');t.remove();requestAnimationFrame(function(){if(window.__bf_hydrate)window.__bf_hydrate()})};window.__bf_swap=s})()</script>};
}

sub async_boundary ($self, $id, $fallback_html) {
    return qq{<div bf-async="$id">$fallback_html</div>};
}

sub async_resolve ($self, $id, $content_html) {
    return qq{<template bf-async-resolve="$id">$content_html</template><script>__bf_swap("$id")</script>};
}

1;
