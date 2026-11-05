#!/usr/bin/env node
/**
 * Writes src/services/veille/supportedArchs.json: the model architectures the
 * embedded llama.cpp can load, read from llama.rn's copy of llama-arch.cpp.
 * The in-app model watch uses it the way veille/refresh_hf_catalogue.py does.
 * Run by postinstall, so an engine upgrade updates it with the install.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(
  root,
  'node_modules/llama.rn/vendor/llama.cpp/src/llama-arch.cpp',
);
const out = path.join(root, 'src/services/veille/supportedArchs.json');

if (!fs.existsSync(src)) {
  console.warn(`gen-supported-archs: ${src} not found, list not written`);
  process.exit(0);
}
const archs = [
  ...fs
    .readFileSync(src, 'utf8')
    .matchAll(/\{\s*LLM_ARCH_[A-Z0-9_]+,\s*"([^"]+)"/g),
].map(m => m[1]);
const llamaRn = require(
  path.join(root, 'node_modules/llama.rn/package.json'),
).version;
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(
  out,
  JSON.stringify({llamaRn, archs: [...new Set(archs)].sort()}, null, 1) + '\n',
);
console.log(
  `gen-supported-archs: ${archs.length} architectures (llama.rn ${llamaRn})`,
);
