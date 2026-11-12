// Compila contracts/RelojProveedor.sol (Nivel 2) y guarda contracts/RelojProveedor.json.
// Uso: npm run compile:reloj. Requiere las dependencias de desarrollo (solc).
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './runtime.mjs';
import {RELOJ_ARTIFACT,compileReloj} from './reloj.mjs';

const artifact = await compileReloj();
await fs.writeFile(RELOJ_ARTIFACT, JSON.stringify(artifact, null, 2) + '\n');
console.log(`${path.relative(ROOT, RELOJ_ARTIFACT)} · solc ${artifact.compiler} · ${(artifact.bytecode.length - 2) / 2} bytes de bytecode`);
