# Publishing @marknotton/svgenius-core and @marknotton/svgenius-ui

Both packages live in this repo under `packages/` and are published to npm from Mark's personal account.

1. Bump `version` in `packages/core/package.json` and `packages/ui/package.json` (keep them in step).
2. Check you're on the right account: `npm whoami` (log in with `npm login` if not).
3. Pack with Yarn, which swaps the `workspace:` ranges for real versions, then publish the tarballs with npm:

```bash
yarn workspace @marknotton/svgenius-core pack --out /tmp/svgenius-core.tgz
yarn workspace @marknotton/svgenius-ui pack --out /tmp/svgenius-ui.tgz
npm publish /tmp/svgenius-core.tgz --access public
npm publish /tmp/svgenius-ui.tgz --access public
```

Publish core first, since ui depends on it. They publish under the `marknotton` npm organisation, so the account must be a member of it.
