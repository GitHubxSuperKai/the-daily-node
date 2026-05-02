# The Daily Node — Claude Instructions

## Build System

`node build.js` concatenates all `src/` files into `Command Center.html`. The script:
- Strips `import`/`export` statements via regex (files share a global scope after concat)
- Embeds the result in `src/index.html` as a `type="text/babel"` script block
- Babel transpiles JSX in-browser at runtime

**Critical constraints — read before touching any component:**

### 1. Imports: default only, never combined
The build regex strips `import X from 'module'` but does NOT strip combined default+named imports:
```js
// BREAKS the build silently (blank page):
import React, { useRef, useState } from 'react';

// Correct — use React.* prefix for all hooks:
import React from 'react';
const ref = React.useRef(null);
const [x, setX] = React.useState(null);
```

### 2. Hook dependency arrays: declare variables first
Babel compiles `const`/`let` to `var`. A `useEffect` whose dep array references a variable declared *later* in the same function body will always see `undefined` in the dep array — React thinks deps never change, so the effect only runs on mount (and may exit early).

```js
// BROKEN — oddsOneIn is undefined at the useEffect call site:
React.useEffect(() => { ... }, [oddsOneIn]);
const oddsOneIn = ...;  // declared after

// Correct — declare first, hook after:
const oddsOneIn = ...;
React.useEffect(() => { ... }, [oddsOneIn]);
```

## Development Workflow

- Edit source in `src/`
- Run `node build.js` to rebuild `Command Center.html`
- Preview server: `python -m http.server 3000` (or port 3002 per launch.json)
- The preview tool server ID is `the-daily-node`
