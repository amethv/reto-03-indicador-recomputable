import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,keccak256,hexlify,toUtf8Bytes} from 'ethers';
import {compile} from '../scripts/runtime.mjs';
import {POLICY,PERIOD,SOURCES,csv,sha,buildEvidence,evidenceHash,BITACORA_HEADERS,newSalt} from '../src/core.mjs';
import {readAnchor} from '../src/chain.mjs';
import {personalValues,searchPersonalData,collectChainData} from '../src/privacy.mjs';

const texts = Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async ([k, f]) => [k, await fs.readFile(new URL('../datos/' + f, import.meta.url), 'utf8')])));
const tickets = csv(texts.tickets).rows, events = csv(texts.bitacora, BITACORA_HEADERS).rows;
const values = personalValues(tickets, events);

test('valores buscados: usuarios, técnicos, unidades y actores, sin repetir', () => {
  const kinds = new Set(values.map(v => v.kind));
  assert.deepEqual([...kinds].sort(), ['actor de bitácora', 'tecnico_asignado', 'unidad', 'usuario']);
  assert.equal(new Set(values.map(v => v.value)).size, values.length);
  for (const name of ['Sergio Torres', 'nolmedo', 'ptapia', 'Dirección Metropolitana de Salud']) assert.ok(values.some(v => v.value === name), name);
});

test('control positivo: un nombre en texto o como hash sí se encuentra', async () => {
  const name = 'Sergio Torres';
  const blobs = [
    {source: 'texto', hex: '0xabcd' + hexlify(toUtf8Bytes(name)).slice(2)},
    {source: 'keccak', hex: keccak256(toUtf8Bytes(name.toLowerCase()))},
    {source: 'sha', hex: await sha(name)}
  ];
  const r = await searchPersonalData(blobs, [{value: name, kind: 'usuario'}]);
  assert.deepEqual(r.matches.map(m => m.source).sort(), ['keccak', 'sha', 'texto']);
  // Una coincidencia desalineada (medio byte) no cuenta.
  const odd = await searchPersonalData([{source: 'x', hex: '0xa' + hexlify(toUtf8Bytes(name)).slice(2) + '0'}], [{value: name, kind: 'usuario'}]);
  assert.equal(odd.matches.length, 0);
});

test('cadena real: 0 coincidencias en calldata, eventos, almacenamiento y bytecode', async () => {
  const engine = ganache.provider({wallet: {deterministic: true}, chain: {chainId: 31337, hardfork: 'shanghai'}, logging: {quiet: true}});
  const provider = new BrowserProvider(engine, undefined, {cacheTimeout: -1}); provider.pollingInterval = 50;
  try {
    const artifact = await compile({write: false}), signer = await provider.getSigner(0);
    const contract = await new ContractFactory(artifact.abi, artifact.bytecode, signer).deploy(await sha(JSON.stringify(POLICY)));
    const deployed = await contract.deploymentTransaction().wait(), address = await contract.getAddress();
    const config = {chainId: 31337, address, codeHash: keccak256(await provider.getCode(address)), deploymentBlock: deployed.blockNumber, deploymentTransaction: deployed.hash};
    const baseline = JSON.parse(await fs.readFile(new URL('../src/originals.json', import.meta.url), 'utf8'));
    const evidence = await buildEvidence(texts, baseline, newSalt());
    await (await contract.seal(PERIOD, evidence.root, await evidenceHash(evidence), 187)).wait();
    const anchor = await readAnchor(provider, config);
    const chain = await collectChainData(provider, config, anchor);
    assert.equal(chain.blobs.length, 5);
    const decoded = Object.fromEntries(chain.decoded);
    assert.equal(decoded['Período'], '202607'); assert.equal(decoded['Raíz Merkle'], evidence.root);
    assert.equal(decoded['Compromiso de evidencia'], await evidenceHash(evidence)); assert.equal(decoded['Cantidad de tickets'], '187');
    const result = await searchPersonalData(chain.blobs, values);
    assert.equal(result.searched, values.length); assert.ok(result.patterns >= values.length * 3);
    assert.deepEqual(result.matches, []);
  } finally { provider.destroy(); await engine.disconnect(); }
});
