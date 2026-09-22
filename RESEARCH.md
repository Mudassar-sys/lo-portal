# Research log

Every technical claim this build relies on, with the official source and the
date it was read. A claim without a URL is struck out and anything depending on
it counts as NOT DONE.

Sources allowed: nextjs.org, react.dev, supabase.com/docs, postgresql.org,
tailwindcss.com, ui.shadcn.com, vercel.com/docs, papaparse.com,
learn.microsoft.com, typescript-eslint.io, and the npm registry for versions.
Next.js 16.2 and later ship their own documentation inside the installed
package at node_modules/next/dist/docs, which is the same official text
version matched to the pinned release; lines citing it name the file.

## Versions

- next latest published version is 16.3.5; 16.3.6 is NOT published. `npm view next dist-tags` returns "latest": "16.3.5" and `npm view next@16.3.6` returns E404. https://www.npmjs.com/package/next - 22 Sep 2026
- TODO: 16.3.6 is the out of band security release the plan expects today. Pinned 16.3.5 until it lands. Advisory to re-read before deploy: https://nextjs.org/blog/upcoming-nextjs-security-release-september-22-2026 - 22 Sep 2026
- react 19.3.0 and react-dom 19.3.0 are published. https://www.npmjs.com/package/react - 22 Sep 2026
- @supabase/supabase-js 2.116.0 published. https://www.npmjs.com/package/@supabase/supabase-js - 22 Sep 2026
- @supabase/ssr 0.12.7 published. https://www.npmjs.com/package/@supabase/ssr - 22 Sep 2026
- tailwindcss 4.3.3 and @tailwindcss/postcss 4.3.3 published. https://www.npmjs.com/package/tailwindcss - 22 Sep 2026
- papaparse 5.7.0 published; @types/papaparse 5.5.2 published. https://www.npmjs.com/package/papaparse - 22 Sep 2026
- shadcn CLI 4.21.0 published. https://www.npmjs.com/package/shadcn - 22 Sep 2026
- eslint-config-next 16.3.5 peer dependencies are eslint >=9.0.0 and typescript >=3.3.1. `npm view eslint-config-next@16.3.5 peerDependencies`. https://www.npmjs.com/package/eslint-config-next - 22 Sep 2026

## TypeScript version decision

- typescript 7.0.2 is the latest published release. https://www.npmjs.com/package/typescript - 22 Sep 2026
- typescript-eslint supports TypeScript ">=4.8.4 <6.1.0" only, so TypeScript 7.0 cannot be linted. https://typescript-eslint.io/users/dependency-versions/ - 22 Sep 2026
- Observed directly: with typescript 7.0.2 installed, `npx eslint .` aborts with "typescript-eslint does not support TS 7.0." and ESLint exits non zero. Recorded in docs/evidence/lint-ts7-failure.txt - 22 Sep 2026
- Next.js 16 requires TypeScript 5.1.0 or newer as a minimum, so 5.9.3 is inside the supported range. node_modules/next/dist/docs/01-app/02-guides/... upgrade guide, "TypeScript 5+ Minimum version now 5.1.0". https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Decision: pinned typescript 5.9.3. CLOSED 22 Sep 2026: approved by the Solutions Lead and section 9 plus the pin list of the plan were amended to match, so the plan and the repository now agree. It is no longer a deviation.

## Next.js 16 conventions

- `proxy.ts` replaces the deprecated `middleware.ts` convention as of v16.0.0. The file lives in the project root at the same level as `app`, must export a single function named `proxy` or a default export, and runs on the Node.js runtime, which cannot be reconfigured. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026
- Proxy coverage is not an authorisation boundary on its own: "Always verify authentication and authorization inside each Server Function rather than relying on Proxy alone", because Server Functions are POSTs to the route they are used on and a matcher change can silently remove coverage. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026
- Without a `matcher`, proxy runs on every request including `_next/static` and `public/`, so a negative match pattern is required. https://nextjs.org/docs/app/api-reference/file-conventions/proxy - 22 Sep 2026
- The `next lint` command is removed in 16 and the `eslint` key is removed from the Next config file; linting runs through the ESLint CLI and `next build` no longer lints. https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Observed directly: `eslint` in next.config.ts fails typecheck with TS2353 "'eslint' does not exist in type 'NextConfig'" on next 16.3.5. Key removed.
- Next.js 16 minimum Node.js is 20.9.0. https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Turbopack is the default for `next dev` and `next build` in 16, so no `--turbopack` flag is needed in the scripts. https://nextjs.org/docs/app/guides/upgrading/version-16 - 22 Sep 2026
- Official flat config for a TypeScript app is `defineConfig([...nextVitals, ...])` importing `eslint-config-next/core-web-vitals`, with `eslint-config-next/typescript` added for TypeScript rules. node_modules/next/dist/docs/01-app/03-api-reference/05-config/03-eslint.md. https://nextjs.org/docs/app/api-reference/config/eslint - 22 Sep 2026

## Tailwind CSS 4

- Manual dark mode by class uses `@custom-variant dark (&:where(.dark, .dark *));` after `@import "tailwindcss";`. This overrides the default `prefers-color-scheme` behaviour. https://tailwindcss.com/docs/dark-mode - 22 Sep 2026

## Repository hygiene

- Turbopack keeps a persistent filesystem cache under .next/cache and it is enabled by default for both `next dev` and `next build` in Next.js 16. https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopackFileSystemCache - 22 Sep 2026
- Observed directly: that cache stores the build shell's environment variable names and values, so operator tooling strings can appear there even though no source file contains them. It is gitignored and is not part of the deployable output. Evidence docs/evidence/name-sweep.txt - 22 Sep 2026
