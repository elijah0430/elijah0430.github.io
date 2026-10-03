import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const result = await build({
  entryPoints: ['assets/js/blog-editor.src.js'],
  outfile: 'assets/js/blog-editor.js',
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  minify: true,
  legalComments: 'linked',
  metafile: true,
});

// Keep the complete upstream notices with the checked-in browser bundle.
const packages = new Map();
for (const input of Object.keys(result.metafile.inputs).filter(file => file.includes('node_modules'))) {
  let directory = dirname(resolve(input));
  while (directory !== dirname(directory)) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (pkg.name && !packages.has(pkg.name)) {
        const names = (await readdir(directory)).filter(name => /^(LICENSE|COPYING|THIRD_PARTY_LICENSES)(\.|$)/i.test(name)).sort();
        if (!names.length) throw new Error(`Missing license for ${pkg.name}`);
        const notices = await Promise.all(names.map(name => readFile(join(directory, name), 'utf8')));
        packages.set(pkg.name, `${pkg.name}@${pkg.version}\n${notices.join('\n\n')}`);
      }
      break;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      directory = dirname(directory);
    }
  }
}
await writeFile('assets/vendor/editor-LICENSES.txt',
  'Bundled blog editor dependencies\n\n' + [...packages].sort(([a], [b]) => a.localeCompare(b, 'en')).map(([, text]) => text).join('\n\n-----\n\n') + '\n');
