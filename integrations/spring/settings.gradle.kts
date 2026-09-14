rootProject.name = "barefootjs-spring-example"

// Composite build (Gradle's equivalent of `integrations/axum`'s Cargo.toml
// PATH dependency on ../../packages/adapter-rust/runtime): the Pebble Java
// runtime (packages/adapter-pebble/java) is a standalone Gradle project with
// no committed wrapper and is NOT published to Maven Central (namespace
// verification + GPG key setup is a separate, out-of-scope future item --
// see that project's README). `includeBuild` + dependency substitution below
// makes `implementation("dev.barefootjs:barefootjs-pebble-runtime")` in
// build.gradle.kts resolve to THIS LOCAL project's classes instead of
// failing to resolve remotely -- a change to the shared runtime is picked up
// automatically on the next build, exactly like axum's path dependency.
includeBuild("../../packages/adapter-pebble/java") {
    dependencySubstitution {
        substitute(module("dev.barefootjs:barefootjs-pebble-runtime")).using(project(":"))
    }
}
