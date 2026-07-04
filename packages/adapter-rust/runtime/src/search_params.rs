//! Port of `packages/adapter-jinja/python/barefootjs/search_params.py`
//! (itself a port of `packages/adapter-perl/lib/BarefootJS/SearchParams.pm`).
//!
//! Request-scoped SSR view of the query string behind the reactive
//! `searchParams()` environment signal. The framework integration builds
//! one per request from the request URL and threads it into the template
//! scope as `searchParams` (the camelCase JS name the adapters keep, like
//! every other signal/prop var); the compiled template reads it via
//! `{{ searchParams.get('key') }}` -- so this is exposed to minijinja
//! templates as a [`minijinja::value::Object`] (implemented below) whose
//! `.get(key)` method call dispatches to [`SearchParams::get`].
//!
//! Semantics mirror the browser's `URLSearchParams.get` exactly under the
//! adapters' `?? -> or` lowering: `get()` returns the first value for a
//! key, or `None`/absent when the key is absent. The minijinja lowering of
//! `??` should coalesce only an absent/none result (a bare `or` would ALSO
//! coalesce a present-but-empty string, which is wrong), preserving the
//! distinction JS `??` draws between `null` and `''` -- the `Object` impl
//! below returns `Value::UNDEFINED` (not `Value::from(())`) for an absent
//! key so the emitted `(x if (x is defined and x is not none) else d)`
//! lowering falls through to the default exactly once.

use minijinja::value::{Enumerator, Object, Value as MjValue};
use minijinja::{Error, ErrorKind, State};
use std::collections::HashMap;
use std::sync::Arc;

/// Percent/`+`-decode a query-string component, mirroring
/// `URLSearchParams`'s `application/x-www-form-urlencoded` parsing. Never
/// panics on malformed input (lenient parsing, matching the browser).
///
/// Operates byte-wise (not char-wise): percent-escapes are always ASCII, so
/// copying every non-escape byte verbatim keeps multi-byte UTF-8 sequences
/// intact while still recognizing `%XX` triples.
fn decode(s: &str) -> String {
    let bytes = s.replace('+', " ").into_bytes();
    let mut raw: Vec<u8> = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let (a, b) = (bytes[i + 1], bytes[i + 2]);
            if (a as char).is_ascii_hexdigit() && (b as char).is_ascii_hexdigit() {
                let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("00");
                if let Ok(byte) = u8::from_str_radix(hex, 16) {
                    raw.push(byte);
                    i += 3;
                    continue;
                }
            }
        }
        raw.push(bytes[i]);
        i += 1;
    }
    // Lenient: a byte run that isn't valid UTF-8 is kept (with replacement
    // characters for the invalid bytes) rather than raising -- mirrors
    // Perl's `utf8::decode`, which never dies.
    String::from_utf8(raw).unwrap_or_else(|e| String::from_utf8_lossy(e.as_bytes()).into_owned())
}

#[derive(Debug)]
pub struct SearchParams {
    values: HashMap<String, Vec<String>>,
}

impl SearchParams {
    /// Parse a raw query string into the reader. A leading '?' is
    /// tolerated, '+' decodes to a space, and %XX escapes are decoded.
    pub fn new(query: &str) -> SearchParams {
        let query = query.strip_prefix('?').unwrap_or(query);
        let mut values: HashMap<String, Vec<String>> = HashMap::new();
        for pair in query.split(['&', ';']) {
            if pair.is_empty() {
                continue;
            }
            let (key, val) = match pair.split_once('=') {
                Some((k, v)) => (k, Some(v)),
                None => (pair, None),
            };
            let key = decode(key);
            let val_decoded = val.map(decode).unwrap_or_default();
            values.entry(key).or_default().push(val_decoded);
        }
        SearchParams { values }
    }

    /// First value for `key`, or `None` when the key is absent. A
    /// present-but-empty value returns `Some("")`.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.values.get(key).and_then(|v| v.first()).map(|s| s.as_str())
    }

    /// Wrap as a template-facing `minijinja::value::Value` (`from_object`
    /// wraps in its own internal `Arc`, matching the `self: &Arc<Self>`
    /// convention the `Object` trait's methods below use).
    pub fn to_value(self) -> MjValue {
        MjValue::from_object(self)
    }
}

impl Object for SearchParams {
    fn call_method(
        self: &Arc<Self>,
        _state: &State<'_, '_>,
        method: &str,
        args: &[MjValue],
    ) -> Result<MjValue, Error> {
        if method != "get" {
            return Err(Error::from(ErrorKind::UnknownMethod));
        }
        let key = args
            .first()
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::new(ErrorKind::MissingArgument, "get() requires a key"))?;
        match self.get(key) {
            // Present-but-empty stays a real (empty) string so `?? d` does
            // NOT fall back to the default -- only an absent key does.
            Some(v) => Ok(MjValue::from(v)),
            None => Ok(MjValue::UNDEFINED),
        }
    }

    fn enumerate(self: &Arc<Self>) -> Enumerator {
        Enumerator::NonEnumerable
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lazy_factory_and_get() {
        let sp = SearchParams::new("sort=price");
        assert_eq!(sp.get("sort"), Some("price"));
        let empty = SearchParams::new("");
        assert_eq!(empty.get("anything"), None);
    }

    #[test]
    fn none_composition_coalesces_only_none() {
        let absent = SearchParams::new("other=x");
        assert_eq!(absent.get("sort"), None);

        let empty = SearchParams::new("sort=");
        assert_eq!(empty.get("sort"), Some(""));
    }

    #[test]
    fn utf8_percent_decoding() {
        let sp = SearchParams::new("q=%E2%9C%93");
        assert_eq!(sp.get("q"), Some("\u{2713}"));
    }

    #[test]
    fn lenient_parsing_never_panics() {
        let _ = SearchParams::new("");
        assert_eq!(SearchParams::new("&&&").get("x"), None);
        assert_eq!(SearchParams::new("=novalue").get("x"), None);
    }

    #[test]
    fn plus_decodes_to_space() {
        let sp = SearchParams::new("q=a+b");
        assert_eq!(sp.get("q"), Some("a b"));
    }

    #[test]
    fn leading_question_mark_tolerated() {
        let sp = SearchParams::new("?a=1&b=2");
        assert_eq!(sp.get("a"), Some("1"));
        assert_eq!(sp.get("b"), Some("2"));
    }
}
