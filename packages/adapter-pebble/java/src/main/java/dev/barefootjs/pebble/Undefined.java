package dev.barefootjs.pebble;

import java.util.Collections;
import java.util.Iterator;

/**
 * JS {@code undefined} (spec/js-undefined-value.md). Java's {@code null} is
 * JS {@code null}; JS {@code undefined} is one singleton,
 * {@link #INSTANCE} ({@code bf.undefined()} in a template), created only
 * where JS reads one: a missing key, an out-of-range index, {@code .at()} /
 * {@code .find()} with no result, {@code ?.} over a nullish receiver, the
 * {@code undefined} identifier, an omitted declared prop. No decoded data is
 * walked to convert anything.
 *
 * <p>Pebble sees it as an ordinary object, so:
 *
 * <ul>
 *   <li>Pebble's own {@code if} / {@code and} / {@code or} / {@code not}
 *       refuse it (they accept only a {@link Boolean}), and its
 *       {@code is null} / {@code == null} / {@code default} read it as a
 *       value: every runtime and emitter site that means JS "nullish" tests
 *       through {@link #isNullish} ({@code bf.is_nullish} in a template),
 *       and every truthiness test through {@code bf.truthy}, which reads it
 *       as {@code false};
 *   <li>{@link #toString()} is {@code ""}, so a text or attribute position
 *       prints nothing, as JSX renders {@code undefined} there;
 *   <li>it is an empty {@link Iterable}, so Pebble's {@code {% for %}} over
 *       it iterates nothing, as over {@code null} (the loop source of
 *       {@code items?.map(...)} over an omitted {@code items}); every
 *       {@code bf} helper tests for a {@code List}, never an
 *       {@code Iterable}, so no helper reads it as an array;
 *   <li>the runtime's own JSON writer ({@code Bf.json}) follows
 *       {@code JSON.stringify}: an object member holding it is dropped, an
 *       array element holding it is {@code null}. A host encoder (Gson,
 *       Jackson) must not be handed it.
 * </ul>
 *
 * <p>Identity is the class: {@link #isUndefined} is an {@code instanceof}
 * test.
 */
public final class Undefined implements Iterable<Object> {

  /** The singleton. */
  public static final Undefined INSTANCE = new Undefined();

  private Undefined() {
  }

  /** JS {@code v === undefined}. */
  public static boolean isUndefined(Object v) {
    return v instanceof Undefined;
  }

  /** JS {@code v === null}: Java's {@code null}. */
  public static boolean isNull(Object v) {
    return v == null;
  }

  /** JS {@code v == null}: {@code null} or {@code undefined}. */
  public static boolean isNullish(Object v) {
    return v == null || v instanceof Undefined;
  }

  @Override
  public String toString() {
    return "";
  }

  /** Nothing: a template loop over JS {@code undefined} renders no row. */
  @Override
  public Iterator<Object> iterator() {
    return Collections.emptyIterator();
  }
}
