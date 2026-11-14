// npm run presentacion · El día de la presentación: julio sin sellar y el sellado se hace en vivo.
// Archiva el período activo de Sepolia (configuración y evidencia) en evidencias/sepolia-historial/
// y arranca la app sin período activo. Nada se borra: las sales siguen en .secreto/, una por contrato.
// Si la app se cierra por accidente durante la presentación, reabrir con npm start: conserva el período.
import path from 'node:path';
import {ROOT} from './runtime.mjs';
import {archivarPeriodo} from './sepolia-web.mjs';
import {startApp} from './start.mjs';

const archivado = await archivarPeriodo();
console.log(archivado
 ? `Período anterior de Sepolia archivado en ${path.relative(ROOT, archivado)}`
 : 'No había un período activo de Sepolia: nada que archivar.');
const app = await startApp({presentacion: true});
console.log('Modo presentación: julio sin sellar. Vista Sellar → Administración: conecta MetaMask y prepara un nuevo período.');
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
