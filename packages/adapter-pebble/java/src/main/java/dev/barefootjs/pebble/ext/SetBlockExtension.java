package dev.barefootjs.pebble.ext;

import io.pebbletemplates.pebble.extension.AbstractExtension;
import io.pebbletemplates.pebble.tokenParser.TokenParser;

import java.util.List;

/**
 * Installs {@link SetBlockTokenParser} as the runtime's {@code set} tag
 * handler (BarefootJS #2101 Phase 3b). Registered on the engine builder in
 * {@code Main} via {@code .extension(new SetBlockExtension())}.
 */
public final class SetBlockExtension extends AbstractExtension {

  @Override
  public List<TokenParser> getTokenParsers() {
    return List.of(new SetBlockTokenParser());
  }
}
