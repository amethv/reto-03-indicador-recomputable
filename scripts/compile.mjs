// Compila contracts/RegistroIndicador.sol y guarda contracts/RegistroIndicador.json:
// abi, bytecode, versión del compilador e input estándar (Etherscan lo necesita para verificar).
// Uso: npm run compile. Requiere las dependencias de desarrollo (solc).
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT,ARTIFACT_PATH,compile} from './runtime.mjs';

const artifact = await compile();
await fs.writeFile(ARTIFACT_PATH, JSON.stringify(artifact, null, 2) + '\n');
console.log(`${path.relative(ROOT, ARTIFACT_PATH)} · solc ${artifact.compiler} · ${(artifact.bytecode.length - 2) / 2} bytes de bytecode`);
