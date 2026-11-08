// Criterio 5: buscar datos personales en lo que de verdad hay en la cadena.
// Se leen calldata, eventos, almacenamiento y bytecode reales y se buscan los nombres
// en texto UTF-8 (también en mayúsculas y minúsculas) y como SHA-256 y keccak256.
import {AbiCoder,Contract,keccak256,toUtf8Bytes,toBeHex,zeroPadValue} from 'ethers';
import {ABI} from './chain.mjs';
import {PERIOD,sha} from './core.mjs';

/** Valores personales del lote: usuarios, técnicos, unidades y actores de la bitácora. */
export function personalValues(tickets, events) {
  const values = new Map();
  const add = (kind, v) => { const value = String(v ?? '').trim(); if (value && !values.has(value)) values.set(value, kind); };
  for (const t of tickets) { add('usuario', t.usuario); add('tecnico_asignado', t.tecnico_asignado); add('unidad', t.unidad); }
  for (const e of events) add('actor de bitácora', e.actor);
  return [...values].map(([value, kind]) => ({value, kind}));
}

const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const strip = h => String(h).toLowerCase().replace(/^0x/, '');

/** Formas en que un nombre podría aparecer en bytes: texto y hashes. */
export async function variants(value) {
  const forms = new Set([value, value.toLowerCase(), value.toUpperCase()]);
  const out = [];
  for (const form of forms) {
    out.push({form: 'texto UTF-8', hex: hex(toUtf8Bytes(form))});
    out.push({form: 'SHA-256', hex: strip(await sha(form))});
    out.push({form: 'keccak256', hex: strip(keccak256(toUtf8Bytes(form)))});
  }
  return out;
}

/** Busca cada valor en cada bloque de bytes, solo en límites de byte. Función pura. */
export async function searchPersonalData(blobs, values) {
  const sources = blobs.map(b => ({source: b.source, hex: strip(b.hex)}));
  const matches = [];
  let patterns = 0;
  for (const {value, kind} of values) {
    for (const v of await variants(value)) {
      patterns++;
      for (const s of sources) {
        let i = s.hex.indexOf(v.hex);
        while (i !== -1 && i % 2) i = s.hex.indexOf(v.hex, i + 1);
        if (i !== -1) matches.push({kind, form: v.form, source: s.source, offset: i / 2});
      }
    }
  }
  return {searched: values.length, patterns, bytes: sources.reduce((n, s) => n + s.hex.length / 2, 0), sources: sources.map(s => s.source), matches};
}

/** Lee de la cadena todo lo que el sellado dejó: calldata, eventos, almacenamiento y código. */
export async function collectChainData(provider, config, anchor) {
  const contract = new Contract(config.address, ABI, provider);
  const blobs = [];
  const tx = await provider.getTransaction(anchor.transactionHash);
  blobs.push({source: 'calldata de la transacción de sellado', hex: tx.data});
  const deployment = await provider.getTransaction(config.deploymentTransaction);
  if (deployment) blobs.push({source: 'calldata del despliegue (bytecode + hash de reglas)', hex: deployment.data});
  blobs.push({source: 'bytecode desplegado', hex: await provider.getCode(config.address)});
  const from = config.sealBlock ?? config.deploymentBlock, to = config.sealBlock ?? 'latest';
  const logs = await provider.getLogs({address: config.address, fromBlock: from, toBlock: to});
  logs.forEach((log, i) => blobs.push({source: `evento ${i + 1}: temas y datos`, hex: '0x' + [...log.topics, log.data].map(strip).join('')}));
  // Seal en mapping(uint32 => Seal) en la ranura 0: keccak256(abi.encode(periodo, 0)) y las dos siguientes.
  const base = BigInt(keccak256(AbiCoder.defaultAbiCoder().encode(['uint256', 'uint256'], [PERIOD, 0])));
  const slots = [];
  for (let k = 0n; k < 3n; k++) slots.push(await provider.getStorage(config.address, base + k));
  blobs.push({source: 'almacenamiento del sello (3 ranuras)', hex: '0x' + slots.map(strip).join('')});
  const packed = BigInt(slots[2]);
  const decoded = [
    ['Período', String(PERIOD)],
    ['Raíz Merkle', slots[0]],
    ['Compromiso de evidencia', slots[1]],
    ['Cantidad de tickets', String(packed & 0xffffffffn)],
    ['Marca de tiempo', new Date(Number(packed >> 32n) * 1000).toISOString()],
    ['Hash de reglas', await contract.rulesHash()],
    ['Sellador (dirección)', await contract.owner()]
  ];
  return {blobs, decoded, slotKeys: [0n, 1n, 2n].map(k => zeroPadValue(toBeHex(base + k), 32))};
}
