package dev.barefootjs.pebble;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * JS-compatible number coercion and formatting, centralized in ONE place
 * (BarefootJS #2101 Phase 3a watchpoint: "long/double split", "String()
 * -compatible float formatting").
 *
 * <p>Every value that flows through a `bf.*` helper as a "JS number" is
 * represented as a boxed {@code double} — JS has exactly one number type,
 * so this runtime never splits numbers across {@code long}/{@code int}/
 * {@code double} the way idiomatic Java code normally would. Pebble's OWN
 * literal parser and native arithmetic (`{% set x = 5 %}`, `a + b` on
 * context values Pebble itself parsed) can still hand a `bf.*` method an
 * {@code Integer}/{@code Long}/{@code BigDecimal} — {@link #toDouble}
 * unwraps any {@link Number} subtype uniformly, so every helper method
 * downstream only ever deals with {@code double}.
 */
public final class JsNumber {

  private JsNumber() {
  }

  /** Unwrap any {@link Number} (however Pebble or Gson boxed it) to a double. */
  public static double toDouble(Object v) {
    if (v instanceof Number) {
      return ((Number) v).doubleValue();
    }
    throw new IllegalArgumentException("not a number: " + (v == null ? "null" : v.getClass()));
  }

  /**
   * JS {@code Number(v)} coercion (the {@code number} helper, spec
   * "number" entry): numeric passthrough; string parsing with surrounding
   * whitespace trimmed (empty string -> 0); {@code null} -> 0; booleans ->
   * 1/0; non-numeric strings (and the literal {@code "NaN"}) -> NaN.
   */
  public static double jsNumber(Object v) {
    if (v == null) {
      return 0.0;
    }
    if (v instanceof Number) {
      return ((Number) v).doubleValue();
    }
    if (v instanceof Boolean) {
      return ((Boolean) v) ? 1.0 : 0.0;
    }
    if (v instanceof String) {
      String s = ((String) v).trim();
      if (s.isEmpty()) {
        return 0.0;
      }
      // JS `Number("0x1A")` supports hex/octal/binary prefixes and `Infinity`;
      // Java's Double.parseDouble does not accept those, nor a bare "Infinity"
      // with a leading '+', nor JS's rejection of trailing garbage that
      // Double.parseDouble is lenient about (e.g. "1d"/"1f" suffixes) — reject
      // those explicitly so they land on NaN like JS, not a silently-parsed
      // Java float suffix.
      if (s.equals("Infinity") || s.equals("+Infinity")) {
        return Double.POSITIVE_INFINITY;
      }
      if (s.equals("-Infinity")) {
        return Double.NEGATIVE_INFINITY;
      }
      if (s.chars().anyMatch(c -> c == 'd' || c == 'D' || c == 'f' || c == 'F' || c == 'x' || c == 'X')) {
        return Double.NaN;
      }
      try {
        return Double.parseDouble(s);
      } catch (NumberFormatException e) {
        return Double.NaN;
      }
    }
    // Arrays/objects are outside the vector-tested domain for `number`; JS
    // would call valueOf/toString — not meaningful for a Java List/Map, so
    // NaN (a total, never-throwing fallback) rather than guessing a shape.
    return Double.NaN;
  }

  /**
   * JS {@code String(v)} formatting for a NUMBER, ECMA-262 Number::toString:
   * shortest round-trip digit string, decimal point placement per the
   * digit-count/exponent rule, `NaN`/`Infinity`/`-Infinity` literal, `-0`
   * prints as `"0"` (only `Object.is` distinguishes signed zero — not part
   * of this contract). Java's own `Double.toString` already computes the
   * shortest round-trip SIGNIFICANT DIGITS, but formats them under
   * different thresholds/conventions (always a decimal point, `E`-notation
   * switch points at 1e7/1e-3) — this method re-derives ECMA's decimal
   * point / exponential-notation placement from those same digits so the
   * text matches JS's `String(number)` output byte-for-byte.
   */
  public static String numberToString(double d) {
    if (Double.isNaN(d)) {
      return "NaN";
    }
    if (d == Double.POSITIVE_INFINITY) {
      return "Infinity";
    }
    if (d == Double.NEGATIVE_INFINITY) {
      return "-Infinity";
    }
    if (d == 0.0) {
      // Covers both +0 and -0 (JS String(-0) === "0").
      return "0";
    }

    boolean negative = d < 0;
    double abs = Math.abs(d);

    // Integral doubles within the exact-long range: format directly as an
    // integer, sidestepping Double.toString's mantissa/exponent dance
    // entirely (also the case most sensitive to the "1.0" vs "1" bug this
    // helper exists to prevent).
    if (abs == Math.floor(abs) && abs < 1e21 && abs <= Long.MAX_VALUE) {
      String digits = Long.toString((long) abs);
      return negative ? "-" + digits : digits;
    }

    String javaRepr = Double.toString(abs); // e.g. "1.5", "1.0E20", "1.0E-7"
    String mantissa;
    int exp10;
    int eIdx = javaRepr.indexOf('E');
    if (eIdx >= 0) {
      mantissa = javaRepr.substring(0, eIdx);
      exp10 = Integer.parseInt(javaRepr.substring(eIdx + 1));
    } else {
      mantissa = javaRepr;
      exp10 = 0;
    }
    int dot = mantissa.indexOf('.');
    String intPart = dot >= 0 ? mantissa.substring(0, dot) : mantissa;
    String fracPart = dot >= 0 ? mantissa.substring(dot + 1) : "";
    if (fracPart.equals("0")) {
      fracPart = "";
    }
    String digits = intPart + fracPart;
    // `n` (ECMA 7.1.12.1): position of the decimal point relative to the
    // start of `digits`, i.e. digits represent s * 10^(n-k) for k digits.
    int n = intPart.length() + exp10;

    // Strip leading zeros (abs < 1 case: intPart == "0").
    int lead = 0;
    while (lead < digits.length() - 1 && digits.charAt(lead) == '0') {
      lead++;
      n--;
    }
    digits = digits.substring(lead);
    // Strip trailing zeros (keep at least one digit).
    int end = digits.length();
    while (end > 1 && digits.charAt(end - 1) == '0') {
      end--;
    }
    digits = digits.substring(0, end);

    int k = digits.length();
    String result;
    if (k <= n && n <= 21) {
      result = digits + zeros(n - k);
    } else if (0 < n && n <= 21) {
      result = digits.substring(0, n) + "." + digits.substring(n);
    } else if (-6 < n && n <= 0) {
      result = "0." + zeros(-n) + digits;
    } else {
      String digitsPart = (k == 1) ? digits : digits.charAt(0) + "." + digits.substring(1);
      int e = n - 1;
      result = digitsPart + "e" + (e >= 0 ? "+" : "") + e;
    }
    return negative ? "-" + result : result;
  }

  private static String zeros(int n) {
    if (n <= 0) {
      return "";
    }
    char[] c = new char[n];
    java.util.Arrays.fill(c, '0');
    return new String(c);
  }

  /**
   * JS {@code Math.round} — a half rounds toward +Infinity
   * (`Math.round(-1.5)` -> -1, `Math.round(2.5)` -> 3). {@code Math.floor(n
   * + 0.5)} agrees with JS on every value except the sign of a `-0` result,
   * which no JSON/value-compat contract here observes (see the reference
   * TS implementation's identical note).
   */
  public static double jsRound(double n) {
    if (Double.isNaN(n) || Double.isInfinite(n)) {
      return n;
    }
    return Math.floor(n + 0.5);
  }

  /**
   * JS {@code Number.prototype.toFixed(digits)}. Operates on the EXACT
   * IEEE-754 binary value of {@code v} (via {@code new BigDecimal(double)},
   * never {@code BigDecimal.valueOf} which would round through
   * {@code Double.toString} first) — same rounding surprises as JS for a
   * value like {@code 1.005} (whose double bits are fractionally just under
   * 1.005), since both operate on the same underlying bit pattern.
   */
  public static String toFixed(double v, int digits) {
    if (Double.isNaN(v)) {
      return "NaN";
    }
    if (Double.isInfinite(v)) {
      return v > 0 ? "Infinity" : "-Infinity";
    }
    BigDecimal bd = new BigDecimal(v).setScale(digits, RoundingMode.HALF_UP);
    return bd.toPlainString();
  }

  /**
   * JS `%`: remainder with the DIVIDEND's sign (C `fmod`-style), e.g.
   * `-7 % 3` -> -1. Verified empirically (Phase 3a research): Java's `%` on
   * primitive doubles/longs is ALSO IEEE-754 remainder-with-dividend-sign
   * (JLS 15.17.3), so this is a direct pass-through — no manual sign
   * correction needed, unlike a divisor-sign-following host (Python/Ruby's
   * native `%`, which is why the Ruby adapter routes through
   * `Numeric#remainder` instead of `%`).
   */
  public static double jsMod(double a, double b) {
    return a % b;
  }
}
