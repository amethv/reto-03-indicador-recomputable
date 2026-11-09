// Despliegue y sellado en una red pública. Lo usan deploy-testnet.mjs y seal-testnet.mjs,
// y las pruebas lo ejercitan contra Ganache. La llave privada solo vive en .env y en el
// objeto Wallet de este proceso: nunca se escribe en disco ni se envía al navegador.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ContractFactory,Contract,keccak256} from 'ethers';
import {ROOT,loadArtifact,SALT_FILES,readSalt,writeSalt} from './runtime.mjs';
import {ABI,readAnchor} from '../src/chain.mjs';
import {POLICY,PERIOD,SOURCES,sha,buildEvidence,evidenceHash,authenticateEvidence,newSalt} from '../src/core.mjs';

export const SEPOLIA = Object.freeze({
  chainId: 11155111,
  name: 'Sepolia (testnet pública de Ethereum)',
  explorer: 'https://sepolia.etherscan.io',
  publicRpc: 'https://ethereum-sepolia-rpc.publicnode.com'
});
export const CONFIG_PATH = path.join(ROOT, 'evidencias', 'red-sepolia.json');
export const EVIDENCE_PATH = path.join(ROOT, 'evidencias', 'sello-sepolia.json');

/** Lee .env (si existe) y valida las variables sin imprimir la llave. */
export function loadSettings({envFile = path.join(ROOT, '.env')} = {}) {
  try { process.loadEnvFile(envFile); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const missing = ['SEPOLIA_RPC_URL', 'SELLADOR_PRIVATE_KEY'].filter(k => !process.env[k]);
  if (missing.length) throw new Error(`Faltan variables en .env: ${missing.join(', ')}. Copia .env.example a .env y complétalo.`);
  const key = process.env.SELLADOR_PRIVATE_KEY.trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('SELLADOR_PRIVATE_KEY debe tener 0x y 64 caracteres hexadecimales.');
  return {
    rpcUrl: process.env.SEPOLIA_RPC_URL.trim(),
    privateKey: key,
    etherscanKey: process.env.ETHERSCAN_API_KEY?.trim() || null,
    publicRpc: process.env.SEPOLIA_PUBLIC_RPC_URL?.trim() || SEPOLIA.publicRpc
  };
}

export async function requireNetwork(provider, chainId = SEPOLIA.chainId) {
  const actual = Number((await provider.getNetwork()).chainId);
  if (actual !== chainId) throw new Error(`El RPC apunta a la red ${actual}; se esperaba ${chainId}.`);
}

export async function requireBalance(provider, address) {
  const balance = await provider.getBalance(address);
  if (balance === 0n) throw new Error(`La cuenta ${address} no tiene ETH de prueba. Pide Sepolia ETH en un faucet y vuelve a intentarlo.`);
  return balance;
}

const links = (explorer, config) => explorer ? {
  contract: `${explorer}/address/${config.address}`,
  deployment: `${explorer}/tx/${config.deploymentTransaction}`,
  ...(config.sealTransaction ? {seal: `${explorer}/tx/${config.sealTransaction}`} : {})
} : {};

/** Despliega RegistroIndicador y devuelve la configuración pública (sin secretos). */
export async function deployContract({signer, publicRpc, network = SEPOLIA.name, explorer = SEPOLIA.explorer, confirmations = 2}) {
  const artifact = await loadArtifact();
  const rulesHash = await sha(JSON.stringify(POLICY));
  const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(rulesHash);
  const receipt = await contract.deploymentTransaction().wait(confirmations);
  if (receipt.status !== 1) throw new Error('Falló el despliegue');
  const provider = signer.provider, address = await contract.getAddress();
  const config = {
    network, chainId: Number((await provider.getNetwork()).chainId), address,
    deploymentBlock: receipt.blockNumber, deploymentTransaction: receipt.hash,
    codeHash: keccak256(await provider.getCode(address)), rulesHash, rulesVersion: POLICY.version,
    sealer: await signer.getAddress(), rpc: publicRpc, explorer, local: false,
    evidenceFile: 'sello-sepolia.json', compiler: artifact.compiler
  };
  config.links = links(explorer, config);
  return {config, artifact};
}

async function readSources() {
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([k, f]) => [k, await fs.readFile(path.join(ROOT, 'datos', f), 'utf8')]));
  return Object.fromEntries(entries);
}

/** Sella julio de 2026 con los originales de datos/ y comprueba el ancla leyendo la cadena. */
export async function sealPeriod({signer, config, confirmations = 2, saltFile = SALT_FILES.sepolia}) {
  const baseline = JSON.parse(await fs.readFile(path.join(ROOT, 'src', 'originals.json'), 'utf8'));
  // La sal se crea una sola vez y se guarda ANTES de enviar la transacción: si el envío
  // falla o se repite, se reutiliza la misma y el compromiso no cambia.
  let salt = await readSalt(saltFile);
  if (!salt) { salt = newSalt(); await writeSalt(saltFile, salt); }
  const evidence = await buildEvidence(await readSources(), baseline, salt);
  const commitment = await evidenceHash(evidence);
  const contract = new Contract(config.address, ABI, signer);
  if (await contract.rulesHash() !== await sha(JSON.stringify(POLICY))) throw new Error('El contrato desplegado usa otras reglas. Despliega de nuevo.');
  const existing = await contract.getSeal(PERIOD);
  let sealBlock = config.sealBlock, sealTransaction = config.sealTransaction;
  if (existing.timestamp !== 0n) {
    if (existing.root !== evidence.root || existing.evidenceHash !== commitment) throw new Error('El período ya está sellado con otro compromiso. No se reemplaza.');
    if (!sealTransaction) {
      const [log] = await contract.queryFilter(contract.filters.Sealed(PERIOD), config.deploymentBlock, 'latest');
      sealTransaction = log.transactionHash; sealBlock = log.blockNumber;
    }
  } else {
    const tx = await contract.seal(PERIOD, evidence.root, commitment, evidence.count);
    const receipt = await tx.wait(confirmations);
    if (receipt.status !== 1) throw new Error('La transacción de sellado falló');
    sealTransaction = receipt.hash; sealBlock = receipt.blockNumber;
  }
  const sealed = {...config, sealTransaction, sealBlock};
  const anchor = await readAnchor(signer.provider, sealed);
  const auth = await authenticateEvidence(evidence, anchor);
  if (!auth.ok) throw new Error(auth.error);
  sealed.links = links(config.explorer, sealed);
  return {config: sealed, evidence, anchor, salt};
}

export async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), {recursive: true});
  await fs.writeFile(file, JSON.stringify(data, null, 2) + '\n');
}

/** Verificación opcional del código fuente en Etherscan (API v2). No detiene el flujo si falla. */
export async function verifyOnEtherscan({config, apiKey, input, compiler}) {
  const version = 'v' + compiler.replace(/\.Emscripten.*$/, '');
  const body = new URLSearchParams({
    module: 'contract', action: 'verifysourcecode', apikey: apiKey,
    codeformat: 'solidity-standard-json-input', sourceCode: JSON.stringify(input),
    contractaddress: config.address, contractname: 'RegistroIndicador.sol:RegistroIndicador',
    compilerversion: version, constructorArguements: config.rulesHash.slice(2)
  });
  const url = `https://api.etherscan.io/v2/api?chainid=${config.chainId}`;
  const response = await fetch(url, {method: 'POST', body});
  const json = await response.json();
  if (json.status !== '1') throw new Error(`Etherscan: ${json.result || json.message}`);
  const guid = json.result;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const check = await (await fetch(`${url}&module=contract&action=checkverifystatus&guid=${guid}&apikey=${apiKey}`)).json();
    if (check.status === '1') return check.result;
    if (!/pending/i.test(check.result)) throw new Error(`Etherscan: ${check.result}`);
  }
  throw new Error('Etherscan no confirmó la verificación a tiempo; revisa el contrato en el explorador.');
}
