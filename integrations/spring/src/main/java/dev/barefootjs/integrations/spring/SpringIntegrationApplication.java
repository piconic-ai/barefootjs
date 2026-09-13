package dev.barefootjs.integrations.spring;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * BarefootJS + Spring Boot example. Java/Spring MVC port of
 * {@code integrations/axum}'s route table and rendering architecture (see
 * that integration's {@code src/main.rs}/{@code src/render.rs} for the
 * reference this app mirrors), using the Pebble Java runtime
 * ({@code dev.barefootjs.pebble.*}, pulled in via the composite build in
 * {@code settings.gradle.kts}) as its rendering backend instead of Rust +
 * minijinja.
 */
@SpringBootApplication
public class SpringIntegrationApplication {
  public static void main(String[] args) {
    SpringApplication.run(SpringIntegrationApplication.class, args);
  }
}
