// Inline the Vite build (CSS, JS, logo) into one self-contained HTML page body,
// suitable for hosts that wrap the page in their own document skeleton.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const read = (href) => readFileSync(join(dist, href.replace(/^\.?\//, '')), 'utf8');

html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/g, (_, href) => `<style>${read(href)}</style>`);
html = html.replace(/<script type="module" crossorigin src="([^"]+\.js)"><\/script>/g, (_, src) => '');
const js = [...readFileSync(join(dist, 'index.html'), 'utf8').matchAll(/<script type="module" crossorigin src="([^"]+\.js)"><\/script>/g)].map((m) => read(m[1]));
const logo = readFileSync(join(dist, 'era-group-logo.png')).toString('base64');
html = html.replace(/src="\.?\/era-group-logo\.png"/g, `src="data:image/png;base64,${logo}"`);

const head = html.match(/<head>([\s\S]*?)<\/head>/)[1].replace(/<meta charset[^>]*>\s*/, '').replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const out = `${head.trim()}\n${body.trim()}\n<script type="module">${js.join('\n')}</script>\n`;

mkdirSync('dist-single', { recursive: true });
writeFileSync('dist-single/era-manufacturing-explorer.html', out);
console.log(`dist-single/era-manufacturing-explorer.html  ${(out.length / 1024).toFixed(1)} kB`);
