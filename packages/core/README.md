# @svgenius/core

The engine behind [SVGenius](https://github.com/marknotton/svgenius): SVGO presets, attribute rules, find and replace, trim, path editing and geometry helpers.

Shipped as TypeScript source, for bundlers that compile it (Vite, esbuild, Rollup with a TS plugin). Import modules by name:

```ts
import { serveSvg } from "@svgenius/core/serve"           // no DOM: fine in Node
import { optimiseSvg } from "@svgenius/core/optimiser"    // browser, runs SVGO in Web Workers
import { defaultSvgoSettings, runSpec } from "@svgenius/core/settings"
```

`serve` is the text-only pipeline (replacements, attribute rules, SVGO) and runs anywhere. Trim, cut-outs, merging and the other geometry steps need a browser DOM.
