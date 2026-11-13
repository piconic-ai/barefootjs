---
"@barefootjs/jsx": patch
---

A component-local or module-scope const whose initializer allocates (an object or array literal, `new X()`, a call, a function expression) and reads no signal, memo, prop or reactive brand now reaches a child component prop as that one value (#3868). The client prop getter used to return the initializer itself (`get token() { return { n: 1 } }`), so each read of the prop built a new object and `props.token === props.token` was false after hydration or a client mount, while SSR passed one object. The getter now returns the binding the declaration created. A primitive const and a const that reads reactive state still expand as before.
