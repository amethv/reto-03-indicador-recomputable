import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import {BrowserProvider,Wallet} from 'ethers';
import {loadSettings,deployContract,sealPeriod} from '../scripts/testnet.mjs';
import {readSalt} from '../scripts/runtime.mjs';
import {readAnchor} from '../src/chain.mjs';
import {SOURCES,verifyText} from '../src/core.mjs';

// Llave de desarrollo pública de Ganache determinista (cuenta 0). Solo para esta prueba local.
const GANACHE_KEY = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';

test('flujo de testnet ensayado en Ganache: desplegar, sellar y verificar en solo lectura', async () => {
  const engine = ganache.provider({wallet: {deterministic: true}, chain: {chainId: 31337, hardfork: 'shanghai'}, logging: {quiet: true}});
  const provider = new BrowserProvider(engine, undefined, {cacheTimeout: -1}); provider.pollingInterval = 50;
  const saltDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sal-')), saltFile = path.join(saltDir, 'sal-sepolia-202607.json');
  try {
    const signer = new Wallet(GANACHE_KEY, provider);
    const {config} = await deployContract({signer, publicRpc: 'http://127.0.0.1:8545', network: 'Ensayo Ganache', explorer: 'https://sepolia.etherscan.io', confirmations: 1});
    assert.equal(config.sealer, signer.address); assert.equal(config.local, false);
    const {config: sealed, evidence, salt} = await sealPeriod({signer, config, confirmations: 1, saltFile});
    assert.equal(await readSalt(saltFile), salt, 'la sal se guardó en el archivo indicado');
    assert.ok(sealed.sealTransaction && sealed.sealBlock);
    assert.equal(sealed.links.seal, `https://sepolia.etherscan.io/tx/${sealed.sealTransaction}`);
    assert.equal(sealed.links.contract, `https://sepolia.etherscan.io/address/${sealed.address}`);
    // Repetir el sellado no crea otra transacción ni reemplaza el sello.
    assert.equal((await sealPeriod({signer, config: sealed, confirmations: 1, saltFile})).config.sealTransaction, sealed.sealTransaction);
    // Verificación sin wallet: solo un proveedor de lectura y la configuración pública.
    const reader = new BrowserProvider(engine, undefined, {cacheTimeout: -1});
    const anchor = await readAnchor(reader, sealed);
    const texts = Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async ([k, f]) => [k, await fs.readFile(new URL('../datos/' + f, import.meta.url), 'utf8')])));
    assert.equal((await verifyText(texts.tickets, evidence, anchor, texts, salt)).status, 'VERDE');
    assert.equal((await verifyText(texts.tickets, evidence, anchor, texts)).status, 'INCOMPLETA', 'sin sal no hay verde');
    const publicConfig = JSON.stringify(sealed);
    assert.ok(!publicConfig.includes(GANACHE_KEY.slice(2)), 'la configuración pública no contiene la llave');
    assert.ok(!publicConfig.includes(salt.slice(2)) && !JSON.stringify(evidence).includes(salt.slice(2)), 'ni la configuración ni el manifiesto públicos contienen la sal');
  } finally { provider.destroy(); await engine.disconnect(); await fs.rm(saltDir, {recursive: true, force: true}); }
});

test('.env: variables faltantes o llave mal formada dan un error claro', () => {
  const saved = {...process.env};
  try {
    delete process.env.SEPOLIA_RPC_URL; delete process.env.SELLADOR_PRIVATE_KEY;
    assert.throws(() => loadSettings({envFile: 'no-existe.env'}), /Faltan variables en \.env/);
    process.env.SEPOLIA_RPC_URL = 'https://rpc.example'; process.env.SELLADOR_PRIVATE_KEY = '1234';
    assert.throws(() => loadSettings({envFile: 'no-existe.env'}), /64 caracteres/);
    process.env.SELLADOR_PRIVATE_KEY = GANACHE_KEY;
    assert.equal(loadSettings({envFile: 'no-existe.env'}).publicRpc, 'https://ethereum-sepolia-rpc.publicnode.com');
  } finally { process.env = saved; }
});
