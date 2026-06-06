use strict;
use warnings;
use ExtUtils::MakeMaker;
use Module::CPANfile;

my $file    = Module::CPANfile->load;
my $runtime = $file->prereqs->requirements_for('runtime', 'requires')->as_string_hash;
my $test    = $file->prereqs->requirements_for('test',    'requires')->as_string_hash;
delete $runtime->{perl};

WriteMakefile(
    NAME             => 'BarefootJS::Backend::Xslate',
    VERSION_FROM     => 'lib/BarefootJS/Backend/Xslate.pm',
    ABSTRACT_FROM    => 'lib/BarefootJS/Backend/Xslate.pm',
    AUTHOR           => 'kobaken <kentafly88@gmail.com>',
    LICENSE          => 'mit',
    MIN_PERL_VERSION  => '5.020',
    CONFIGURE_REQUIRES => { 'Module::CPANfile' => 0 },
    PREREQ_PM         => $runtime,
    TEST_REQUIRES     => $test,
    META_MERGE       => {
        'meta-spec' => { version => 2 },
        resources   => {
            homepage   => 'https://barefootjs.dev',
            repository => {
                type => 'git',
                url  => 'https://github.com/piconic-ai/barefootjs.git',
                web  => 'https://github.com/piconic-ai/barefootjs',
            },
            bugtracker => {
                web => 'https://github.com/piconic-ai/barefootjs/issues',
            },
        },
    },
);
