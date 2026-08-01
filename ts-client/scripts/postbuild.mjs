import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('dist/esm', { recursive: true });
writeFileSync('dist/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');
writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n');
console.log('postbuild: wrote dist/package.json and dist/esm/package.json');
