/*
 * BarefootJS + Spring Boot example (#2101's tracking issue, "Integration
 * example" deliverable). No committed Gradle wrapper, matching
 * packages/adapter-pebble/java's own documented convention -- the task
 * environment provisions a matching `gradle` directly on PATH.
 *
 * The Pebble Java runtime (`dev.barefootjs.pebble.*`: Bf, ChildMeta,
 * ManifestLoader, SetBlockExtension) is pulled in via the composite build in
 * settings.gradle.kts, NOT vendored -- see that file's header comment.
 */

plugins {
    java
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
}

group = "dev.barefootjs.integrations"
version = "0.1.0"

java {
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")

    // The composite-build substitution in settings.gradle.kts resolves this
    // to packages/adapter-pebble/java's own project output.
    implementation("dev.barefootjs:barefootjs-pebble-runtime")

    // packages/adapter-pebble/java declares both of these as `implementation`
    // (not `api`), so its PebbleEngine/Gson types are NOT on OUR compile
    // classpath transitively -- this app constructs a PebbleEngine directly
    // (mirroring Main.java's `render` method) and decodes/encodes JSON
    // itself, so both need to be declared here too. Versions kept in lock-
    // step with that project's build.gradle.kts (see its own comment for the
    // Maven Central citations).
    implementation("io.pebbletemplates:pebble:4.1.2")
    implementation("com.google.code.gson:gson:2.11.0")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}

tasks.named<Test>("test") {
    useJUnitPlatform()
}

// `bootJar`'s default archive name/classifier is fine as-is (Spring Boot's
// own plugin already gives a fixed, predictable
// `build/libs/barefootjs-spring-example-0.1.0.jar` name derived from
// `rootProject.name`/`version` above) -- the Dockerfile below globs it
// rather than hardcoding the version so a version bump here needs no
// matching Dockerfile edit.
