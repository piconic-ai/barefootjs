import com.github.jengelman.gradle.plugins.shadow.tasks.ShadowJar

/*
 * BarefootJS Pebble Java runtime (#2101, Phase 3a).
 *
 * Ships:
 *  - the `bf` helper surface (`Bf`, `BfNum`, `BfDate`) registered as a Pebble
 *    global variable, matching every `bf.*` call the TS adapter emits
 *    (see `packages/adapter-pebble/src/adapter/`);
 *  - the `ParsedExpr` evaluator (`eval/Evaluator.java`) used for
 *    `.map()/.filter()/.reduce()/.sort()/.find()` callback bodies that don't
 *    lower to native Pebble syntax;
 *  - a CLI entry point (`Main`) that `packages/adapter-pebble/src/test-render.ts`
 *    shells out to via `java -jar` — built ONCE per test run via the
 *    `shadowJar` task and reused across every fixture, mirroring
 *    `packages/adapter-rust/runtime`'s prebuilt-binary caching (a compiled
 *    target can't afford a JVM cold build per fixture the way the
 *    interpreter-per-fixture Jinja/Twig/ERB harnesses can).
 *
 * NOT in this package (Phase 3b, a separate follow-up): the custom
 * `{% set NAME %}...{% endset %}` `TokenParser` extension needed for
 * JSX-children / named-slot / async-fallback forwarding (see the TS
 * adapter's file header, divergence 6). A `.peb` template using that tag
 * shape will not render correctly with this runtime alone yet.
 */

plugins {
    java
    application
    id("com.gradleup.shadow") version "8.3.6"
}

group = "dev.barefootjs"
// Placeholder — mirrors adapter-rust's Cargo.toml convention: the actual
// published version is stamped by the release job from the package's
// changeset-tracked version before publishing (this runtime is not yet
// wired into a Java package registry — see the tracking issue's Phase 5
// checklist for that follow-up).
version = "0.1.0"

java {
    // Pebble 4.x's own `pebble` module still compiles with
    // `maven.compiler.source/target = 1.8` (verified against
    // io.pebbletemplates:pebble's pom.xml on the `master` branch, tag
    // 4.1.3-SNAPSHOT at time of writing) -- Java 8 is the library's own
    // floor. This runtime targets a newer LTS anyway (21, matching the
    // toolchain installed in CI / this environment) since nothing here
    // needs the Java 8 floor and a newer target keeps `record`/pattern
    // matching available for future use.
    toolchain {
        languageVersion = JavaLanguageVersion.of(21)
    }
}

repositories {
    mavenCentral()
}

dependencies {
    // Maven coordinates + version confirmed via Maven Central
    // (https://central.sonatype.com/artifact/io.pebbletemplates/pebble/4.1.2)
    // at time of writing -- see the package README's "Java runtime research
    // findings" section for the full citation list.
    implementation("io.pebbletemplates:pebble:4.1.2")

    // JSON encode/decode for the `bf.json` helper (JS `JSON.stringify`
    // parity) and for decoding the evaluator's serialized-`ParsedExpr` JSON
    // payload (`bf.*_eval` calls) and the CLI's vars/props JSON file. Gson
    // chosen over Jackson for a minimal, dependency-light fat jar (single
    // artifact, no jackson-databind/annotations/core split).
    implementation("com.google.code.gson:gson:2.11.0")

    testImplementation(platform("org.junit:junit-bom:5.11.4"))
    testImplementation("org.junit.jupiter:junit-jupiter")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

application {
    mainClass.set("dev.barefootjs.pebble.Main")
}

tasks.test {
    useJUnitPlatform()
}

tasks.named<ShadowJar>("shadowJar") {
    // Fixed, predictable name so `test-render.ts` doesn't need to glob for
    // a version-qualified jar. Mirrors `adapter-rust`'s fixed
    // `target/debug/bf-render` path.
    archiveBaseName.set("barefootjs-pebble-runtime")
    archiveClassifier.set("")
    archiveVersion.set("")
    manifest {
        attributes["Main-Class"] = "dev.barefootjs.pebble.Main"
    }
}

// `test-render.ts` depends on `build/libs/barefootjs-pebble-runtime.jar`
// existing after this task runs -- wiring `build` to depend on it keeps a
// plain `gradle build` sufficient to produce it, matching how a developer
// would naturally invoke this project.
tasks.named("build") {
    dependsOn(tasks.named("shadowJar"))
}
