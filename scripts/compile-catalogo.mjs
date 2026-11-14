// Compila contracts/RegistroCatalogo.sol (Nivel 3) y guarda contracts/RegistroCatalogo.json.
// Uso: npm run compile:catalogo. Requiere las dependencias de desarrollo (solc).
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './runtime.mjs';
import {CATALOGO_ARTIFACT,compileCatalogo} from './catalogo.mjs';

const artifact = await compileCatalogo();
await fs.writeFile(CATALOGO_ARTIFACT, JSON.stringify(artifact, null, 2) + '\n');
console.log(`${path.relative(ROOT, CATALOGO_ARTIFACT)} · solc ${artifact.compiler} · ${(artifact.bytecode.length - 2) / 2} bytes de bytecode`);
