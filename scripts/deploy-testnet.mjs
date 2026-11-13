// Despliega RegistroIndicador en Sepolia. Uso: npm run deploy:sepolia
// Requiere .env con SEPOLIA_RPC_URL y SELLADOR_PRIVATE_KEY (ver .env.example).
import fs from 'node:fs/promises';
import {JsonRpcProvider,Wallet,formatEther} from 'ethers';
import {SEPOLIA,CONFIG_PATH,loadSettings,requireNetwork,requireBalance,deployContract,writeJson,verifyOnEtherscan} from './testnet.mjs';
import {archivarPeriodo} from './sepolia-web.mjs';

const settings = loadSettings();
const provider = new JsonRpcProvider(settings.rpcUrl);
await requireNetwork(provider);
const signer = new Wallet(settings.privateKey, provider);
console.log(`Sellador: ${signer.address} · saldo ${formatEther(await requireBalance(provider, signer.address))} ETH de prueba`);

const previous = await fs.readFile(CONFIG_PATH, 'utf8').then(JSON.parse, () => null);
if (previous?.address && !process.argv.includes('--nuevo')) {
  console.log(`Ya existe un despliegue en ${previous.address}. Usa --nuevo para desplegar otro contrato.`);
  process.exit(0);
}

console.log('Desplegando RegistroIndicador… (espera 2 confirmaciones)');
const {config, artifact} = await deployContract({signer, publicRpc: settings.publicRpc});
// El período anterior (si lo hay) pasa a evidencias/sepolia-historial/; no se borra.
const archivo = await archivarPeriodo();
if (archivo) console.log(`Período anterior archivado en ${archivo}`);
await writeJson(CONFIG_PATH, config);
console.log(`Contrato: ${config.address}\nTransacción: ${config.links.deployment}\nGuardado en evidencias/red-sepolia.json`);

if (settings.etherscanKey) {
  try {
    console.log('Verificando el código fuente en Etherscan…');
    console.log(await verifyOnEtherscan({config, apiKey: settings.etherscanKey, input: artifact.input, compiler: artifact.compiler}));
  } catch (error) { console.warn(`No se pudo verificar en Etherscan: ${error.message}`); }
} else console.log('Sin ETHERSCAN_API_KEY: se omite la verificación del código fuente (opcional).');
console.log(`Siguiente paso: npm run seal:sepolia · Explorador: ${SEPOLIA.explorer}`);
provider.destroy();
