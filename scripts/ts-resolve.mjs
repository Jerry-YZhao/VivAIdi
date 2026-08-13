/**
 * Lets Node run the app's TypeScript sources directly. Next.js resolves
 * extensionless relative imports and directory index files; Node's ESM loader
 * does not, so this hook fills the same gaps for tests and scripts.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

const HAS_EXTENSION = /\.[mc]?[jt]sx?$|\.json$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    const aliased = specifier.startsWith("@/");
    if ((relative && !HAS_EXTENSION.test(specifier)) || aliased) {
      const base = aliased
        ? new URL(specifier.slice(2), new URL("../", import.meta.url))
        : new URL(specifier, context.parentURL);
      const candidates = HAS_EXTENSION.test(base.href)
        ? [base.href]
        : [`${base.href}.ts`, `${base.href}.tsx`, `${base.href}/index.ts`];
      for (const url of candidates) {
        if (existsSync(fileURLToPath(url))) {
          // No `format`: Node infers type stripping from the .ts extension.
          return { url, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
