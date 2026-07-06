use strict;
use warnings;
use utf8;

use Test2::V0;

use FindBin qw($Bin);
use lib "$Bin/../lib";

use BarefootJS;

# Multi-component registry modules (#2132).
#
# A registry module exporting several components from one file
# (`ui/toast/index.tsx` → ToastProvider / Toast / ToastTitle) compiles to
# one template per component, and `bf build` lists them in the manifest
# entry's `components` map. Compiled parent templates call each one under
# its snake_cased component name (`render_child('toast_provider')`), so
# `register_components_from_manifest` must register one child renderer per
# component — the old dir-name-only registration left every sub-component
# unresolvable and the render died with "No renderer registered".

# Backend stub that records which template each nested render resolved to,
# along with the vars it received.
{
    package RecordingBackend;
    sub new { bless { calls => [] }, shift }
    sub calls       { $_[0]{calls} }
    sub encode_json { '{}' }
    sub mark_raw    { $_[1] }
    sub materialize { $_[1] }
    sub render_named {
        my ($self, $template_name, $child_bf, $vars) = @_;
        push @{ $self->{calls} }, { template => $template_name, vars => $vars };
        return "<rendered:$template_name>";
    }
}

sub new_bf {
    my $backend = RecordingBackend->new;
    my $bf = BarefootJS->new(undef, { backend => $backend });
    $bf->_scope_id('Root_test');
    return ($bf, $backend);
}

# The manifest shape `bf build` emits for the toast module (see the emitter
# pin in packages/cli/src/__tests__/build-manifest-components.test.ts).
my $TOAST_ENTRY = {
    markedTemplate => 'templates/ui/toast/ToastProvider.html.ep',
    clientJs       => 'client/ui/toast/index.client.js',
    ssrDefaults    => { children => { propName => 'children', value => undef } },
    components     => {
        ToastProvider => {
            markedTemplate => 'templates/ui/toast/ToastProvider.html.ep',
            ssrDefaults    => { children => { propName => 'children', value => undef } },
        },
        Toast => {
            markedTemplate => 'templates/ui/toast/Toast.html.ep',
            ssrDefaults    => {
                open     => { propName => 'open', value => 0 },
                children => { propName => 'children', value => undef },
            },
        },
        ToastTitle => {
            markedTemplate => 'templates/ui/toast/ToastTitle.html.ep',
            ssrDefaults    => { children => { propName => 'children', value => undef } },
        },
    },
};

subtest 'each exported component gets a renderer under its snake_case name' => sub {
    my ($bf, $backend) = new_bf();
    $bf->register_components_from_manifest({ 'ui/toast/index' => $TOAST_ENTRY });

    for my $case (
        [ toast_provider => 'ui/toast/ToastProvider' ],
        [ toast          => 'ui/toast/Toast' ],
        [ toast_title    => 'ui/toast/ToastTitle' ],
    ) {
        my ($slot_key, $template) = @$case;
        my $html = $bf->render_child($slot_key);
        is $html, "<rendered:$template>",
            "render_child('$slot_key') renders $template";
    }
};

subtest 'the dir-name key resolves to the COMPONENT template, not the module primary' => sub {
    # `ui/toast/index`'s dir key is `toast`, which collides with
    # snake_case('Toast'). The per-component registration must win: without
    # it, `render_child('toast')` renders the module's FIRST template
    # (ToastProvider) — the wrong markup entirely.
    my ($bf, $backend) = new_bf();
    $bf->register_components_from_manifest({ 'ui/toast/index' => $TOAST_ENTRY });

    $bf->render_child('toast');
    is $backend->calls->[-1]{template}, 'ui/toast/Toast',
        'toast maps to Toast.html.ep (not ToastProvider.html.ep)';
};

subtest 'per-component ssrDefaults seed the child vars' => sub {
    my ($bf, $backend) = new_bf();
    $bf->register_components_from_manifest({ 'ui/toast/index' => $TOAST_ENTRY });

    # No caller prop → Toast's own static default.
    $bf->render_child('toast');
    is $backend->calls->[-1]{vars}{open}, 0,
        'omitted prop falls back to the component default';

    # Caller-supplied prop wins.
    $bf->render_child('toast', open => 1);
    is $backend->calls->[-1]{vars}{open}, 1, 'caller prop overrides the default';
};

subtest 'signal_init override applies per component key' => sub {
    my ($bf, $backend) = new_bf();
    $bf->register_components_from_manifest(
        { 'ui/toast/index' => $TOAST_ENTRY },
        signal_init => { toast => sub { (open => 'forced') } },
    );

    $bf->render_child('toast');
    is $backend->calls->[-1]{vars}{open}, 'forced',
        'signal_init keyed by the snake_case component name wins over ssrDefaults';

    $bf->render_child('toast_title');
    is $backend->calls->[-1]{template}, 'ui/toast/ToastTitle',
        'sibling components without an override still render';
};

subtest 'manifests without a components map keep the dir-name registration' => sub {
    # Older builds emit no `components` map; the single-component
    # convention (dir name == snake_cased component name) must keep working.
    my ($bf, $backend) = new_bf();
    $bf->register_components_from_manifest({
        'ui/button/index' => {
            markedTemplate => 'templates/ui/button/index.html.ep',
            ssrDefaults    => { variant => { propName => 'variant', value => 'default' } },
        },
    });

    my $html = $bf->render_child('button');
    is $html, '<rendered:ui/button/index>', 'dir-name key still renders';
    is $backend->calls->[-1]{vars}{variant}, 'default', 'entry ssrDefaults still seed';
};

subtest 'a components row without a markedTemplate is skipped, siblings survive' => sub {
    my ($bf, $backend) = new_bf();
    my $entry = {
        %$TOAST_ENTRY,
        components => {
            %{ $TOAST_ENTRY->{components} },
            Broken => {},    # no markedTemplate
        },
    };
    $bf->register_components_from_manifest({ 'ui/toast/index' => $entry });

    like dies { $bf->render_child('broken') }, qr/No renderer registered/,
        'template-less row registers nothing';
    is $bf->render_child('toast_title'), '<rendered:ui/toast/ToastTitle>',
        'sibling components still registered';
};

subtest '_snake_case mirrors the Mojo adapter toTemplateName' => sub {
    is BarefootJS::_snake_case('Toast'),         'toast',          'single word';
    is BarefootJS::_snake_case('ToastProvider'), 'toast_provider', 'two words';
    is BarefootJS::_snake_case('DropdownMenu'),  'dropdown_menu',  'kebab-dir module component';
    is BarefootJS::_snake_case('InputOTP'),      'input_o_t_p',    'acronym splits per capital';
};

done_testing;
