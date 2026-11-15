import {createRequire, registerHooks} from 'node:module';
import {existsSync, realpathSync} from 'node:fs';
import {dirname, extname, sep} from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';

// SDK 1.14.22 publishes extensionless ESM imports. Resolve them while loading
// this plugin without editing pnpm's shared package store.
const require = createRequire(import.meta.url);
const sdk = pathToFileURL(dirname(realpathSync(require.resolve('@snowluma/sdk/package.json'))) + sep).href;
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL?.startsWith(sdk) && specifier.startsWith('.') && !extname(specifier)) {
      for (const suffix of ['.js', '/index.js']) {
        if (existsSync(fileURLToPath(new URL(specifier + suffix, context.parentURL)))) {
          return nextResolve(specifier + suffix, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
let plugin;
try {
  plugin = await import('./lib/index.js');
} finally {
  hooks.deregister();
}
export const {name, inject, Config, apply} = plugin;

