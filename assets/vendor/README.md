# Blog rendering dependencies

Vendored browser distributions, served locally with the blog. No build step or runtime CDN is required.

| Library | Version | Source | License |
| --- | --- | --- | --- |
| Marked | 18.0.14 | https://registry.npmjs.org/marked/-/marked-18.0.14.tgz | MIT |
| DOMPurify | 3.4.16 | https://registry.npmjs.org/dompurify/-/dompurify-3.4.16.tgz | Apache-2.0 OR MPL-2.0 |
| KaTeX | 0.19.0 | https://registry.npmjs.org/katex/-/katex-0.19.0.tgz | MIT |

Each subdirectory includes the upstream license. When updating, replace the corresponding browser files and KaTeX fonts, update this list, and run `node --test tests/blog-markdown.test.cjs`.

The direct editor uses Tiptap 3.31.4 and ProseMirror, bundled into `assets/js/blog-editor.js`. Exact dependencies are pinned in `pnpm-lock.yaml`; complete notices are generated into `editor-LICENSES.txt` by `pnpm build:editor`. Run `pnpm test` after rebuilding.
