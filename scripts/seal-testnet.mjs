// Sella julio de 2026 en el contrato de Sepolia. Uso: npm run seal:sepolia
// Firma el municipio con SELLADOR_PRIVATE_KEY (.env). El navegador solo lee.
import fs from 'node:fs/promises';
import path from 'node:path';
import {JsonRpcProvider,Wallet} from 'ethers';
import {ROOT} from './runtime.mjs';
import {CONFIG_PATH,EVIDENCE_PATH,loadSettings,requireNetwork,requireBalance,sealPeriod,writeJson} from './testnet.mjs';
import {saltFileFor} from './sepolia-web.mjs';

const settings = loadSettings();
const config = await fs.readFile(CONFIG_PATH, 'utf8').then(JSON.parse, () => null);
if (!config?.address) throw new Error('No hay contrato en evidencias/red-sepolia.json. Ejecuta antes npm run deploy:sepolia.');
const provider = new JsonRpcProvider(settings.rpcUrl);
await requireNetwork(provider, config.chainId);
const signer = new Wallet(settings.privateKey, provider);
if (signer.address !== config.sealer) throw new Error(`La llave de .env corresponde a ${signer.address}, pero el contrato lo desplegó ${config.sealer}.`);
await requireBalance(provider, signer.address);

console.log('Sellando julio de 2026 (187 tickets)… espera 2 confirmaciones');
// Un archivo de sal por contrato, el mismo que usa el flujo con MetaMask.
const saltFile = saltFileFor(config.address);
const {config: sealed, evidence, anchor} = await sealPeriod({signer, config, saltFile});
await writeJson(EVIDENCE_PATH, evidence);
await writeJson(CONFIG_PATH, sealed);
console.log(`Sello confirmado en el bloque ${sealed.sealBlock}\nTransacción: ${sealed.links.seal}\nContrato: ${sealed.links.contract}\nRaíz: ${anchor.root}\nGuardado en evidencias/red-sepolia.json y evidencias/sello-sepolia.json`);
console.log(`\nIMPORTANTE: la sal secreta quedó en ${path.relative(ROOT, saltFile)}.\nLa carpeta .secreto/ está en .gitignore y NO se publica. Respáldala aparte: sin ella nadie puede\ncomprobar los tickets de este sello, y con ella publicada se podría adivinar quién reportó cada ticket.`);
provider.destroy();
