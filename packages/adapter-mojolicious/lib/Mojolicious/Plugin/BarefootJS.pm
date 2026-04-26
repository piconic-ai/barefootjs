package Mojolicious::Plugin::BarefootJS;
use Mojo::Base 'Mojolicious::Plugin', -signatures;

use BarefootJS;

sub register ($self, $app, $config = {}) {
    $app->helper(bf => sub ($c) {
        $c->stash->{'bf.instance'} //= BarefootJS->new($c, $config);
    });
}

1;
