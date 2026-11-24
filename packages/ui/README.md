# @marknotton/svgenius-ui

The React screens from [SVGenius](https://github.com/marknotton/svgenius), for embedding in another app: the preset editor, the markup editor and their parts.

Shipped as TypeScript source for Vite. Tell it about the host once, before rendering:

```ts
import { configureHost } from "@marknotton/svgenius-ui/host"

configureHost({
  name: "symbols",
  adapter: { isDesktop: false },
  capabilities: { customPlugins: false, bulkExport: false, writeFiles: true, geometryPresets: false },
})
```

Then import components by path, e.g. `@marknotton/svgenius-ui/components/PresetEditor`, plus `@marknotton/svgenius-ui/styles.css`. The stylesheet is written for a whole page; scope it if you embed it in someone else's.
