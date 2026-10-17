---
"@barefootjs/jsx": patch
---

A signal seeded from a prop with a logical fallback (`createSignal(props.a || 'x')`, `props.a && 'x'`) no longer emits `_p.a || 'x' ?? undefined`, which failed to parse. The CSR init body and the controlled-prop sync effect now read one structured fact the analyzer records (`SignalInfo.propSeed`) instead of matching the initializer text, and a `||` fallback is applied when the sync effect writes the prop.
