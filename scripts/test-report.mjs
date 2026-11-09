// Corre las pruebas y guarda su salida en evidencias/pruebas-unitarias.txt, sin rutas personales.
// Uso: npm run test:evidencia
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {ROOT} from './runtime.mjs';

const files = (await fs.readdir(path.join(ROOT, 'tests'))).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join('tests', f));
const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=spec', ...files], {cwd: ROOT, env: {...process.env, NO_COLOR: '1', FORCE_COLOR: '0'}});
let output = '';
child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
const code = await new Promise(resolve => child.on('close', resolve));

const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const variants = p => [p, p.replaceAll('\\', '/'), p.replaceAll('\\', '\\\\')];
let text = output
  // Aviso de Ganache cuando no trae el binario nativo para esta versión de Node: no es de las pruebas.
  .replace(/This version of µWS is not compatible[\s\S]*?Falling back to a NodeJS implementation; performance may be degraded\.\s*/g, '');
for (const p of variants(ROOT)) text = text.replace(new RegExp(escape(p), 'gi'), '.');
for (const p of variants(os.homedir())) text = text.replace(new RegExp(escape(p), 'gi'), '~');
text = text.replace(/\n{3,}/g, '\n\n');
const header = `Pruebas unitarias · ${new Date().toISOString().slice(0, 10)} (UTC) · Node ${process.version}\nComando: npm test\n\n`;
await fs.writeFile(path.join(ROOT, 'evidencias', 'pruebas-unitarias.txt'), header + text.trim() + '\n');
console.log(text.split('\n').filter(l => /^ℹ (tests|pass|fail)/.test(l)).join('\n'));
console.log('Guardado en evidencias/pruebas-unitarias.txt');
process.exit(code);
