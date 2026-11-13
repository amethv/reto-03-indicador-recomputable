// Sepolia con MetaMask: lo que el servidor comprueba antes de aceptar un período o un sello.
// MetaMask no se puede automatizar; aquí el navegador se reemplaza por firmantes de Ganache.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract} from 'ethers';
import {loadArtifact} from '../scripts/runtime.mjs';
import {loadRelojArtifact} from '../scripts/reloj.mjs';
import {validarDespliegue,registrarPeriodo,guardarSal,leerSal,registrarSello,saltFileFor,readSepoliaConfig} from '../scripts/sepolia-web.mjs';
import {ABI,readAnchor} from '../src/chain.mjs';
import {POLICY,PERIOD,SOURCES,sha,newSalt,buildEvidence,evidenceHash,verifyText} from '../src/core.mjs';

async function setup(){
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'sepolia-web-')),dirs={evidenceDir:path.join(base,'evidencias'),secretDir:path.join(base,'.secreto')};
 const municipio=await provider.getSigner(0),artifact=await loadArtifact(),rules=await sha(JSON.stringify(POLICY));
 const deploy=async(rulesArg=rules,signer=municipio)=>{const c=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(rulesArg);await c.waitForDeployment();return {address:await c.getAddress(),deploymentTransaction:c.deploymentTransaction().hash};};
 return {engine,provider,dirs,municipio,deploy,close:async()=>{provider.destroy();await engine.disconnect();await fs.rm(base,{recursive:true,force:true});}};
}
const local={expectedChainId:31337};

test('preparar período: acepta un RegistroIndicador válido y rechaza bytecode, reglas, red y dirección sin código',async()=>{
 const {provider,dirs,municipio,deploy,close}=await setup();
 try {
  const ok=await deploy();
  const v=await validarDespliegue({provider,...ok,...local});
  assert.equal(v.owner,municipio.address);assert.equal(v.rulesHash,await sha(JSON.stringify(POLICY)));
  // Bytecode distinto: otro contrato (RelojProveedor) en la dirección.
  const reloj=await loadRelojArtifact(),otro=await new ContractFactory(reloj.abi,reloj.bytecode,municipio).deploy([await sha('PV-01')],[(await provider.getSigner(1)).address],[3600],[100]);await otro.waitForDeployment();
  await assert.rejects(validarDespliegue({provider,address:await otro.getAddress(),deploymentTransaction:otro.deploymentTransaction().hash,...local}),/no coincide con RegistroIndicador/);
  // Reglas distintas: mismo contrato desplegado con otro rulesHash.
  const malas=await deploy(await sha('otras reglas'));
  await assert.rejects(validarDespliegue({provider,...malas,...local}),/rulesHash distinto/);
  // Red equivocada: el servidor espera Sepolia (11155111) y el RPC es Ganache (31337).
  await assert.rejects(validarDespliegue({provider,...ok}),/Red equivocada/);
  // Dirección sin código.
  await assert.rejects(validarDespliegue({provider,address:'0x000000000000000000000000000000000000dEaD',deploymentTransaction:ok.deploymentTransaction,...local}),/no tiene código/);
  // Una transacción que no es el despliegue de esa dirección.
  await assert.rejects(validarDespliegue({provider,address:ok.address,deploymentTransaction:malas.deploymentTransaction,...local}),/no es el despliegue/);
  // Solo el municipio configurado, si el servidor lo fija.
  await assert.rejects(validarDespliegue({provider,...ok,...local,admin:(await provider.getSigner(1)).address}),/Solo la cuenta del municipio/);
  // Nada de lo rechazado se guardó.
  assert.equal(await readSepoliaConfig(dirs),null);
  const config=await registrarPeriodo({provider,...ok,...local,publicRpc:'http://127.0.0.1:8545',dirs});
  assert.equal(config.address,ok.address);assert.equal(config.sealer,municipio.address);assert.equal(config.local,false);
  assert.deepEqual(await readSepoliaConfig(dirs),config);
 }finally{await close();}
});

test('sal por contrato: dos contratos distintos no comparten sal y una sal no se reemplaza',async()=>{
 const {provider,dirs,deploy,close}=await setup();
 try {
  const a=await deploy(),b=await deploy();
  assert.notEqual(saltFileFor(a.address,dirs),saltFileFor(b.address,dirs));
  await registrarPeriodo({provider,...a,...local,publicRpc:'x',dirs});
  const salA=newSalt();await guardarSal({address:a.address,salt:salA,dirs});
  await assert.rejects(guardarSal({address:a.address,salt:newSalt(),dirs}),/otra sal/);
  await assert.rejects(guardarSal({address:b.address,salt:newSalt(),dirs}),/no corresponde al contrato vigente/);
  // Nuevo período: otro contrato, otra sal, y la anterior queda intacta en su propio archivo.
  await registrarPeriodo({provider,...b,...local,publicRpc:'x',dirs});
  const salB=newSalt();await guardarSal({address:b.address,salt:salB,dirs});
  assert.equal(await leerSal(dirs),salB);
  assert.equal(JSON.parse(await fs.readFile(saltFileFor(a.address,dirs),'utf8')).salt,salA);
  const historial=await fs.readdir(path.join(dirs.evidenceDir,'sepolia-historial'));
  assert.equal(historial.length,1);assert.ok(historial[0].endsWith(a.address));
 }finally{await close();}
});

test('sellar con la billetera: el servidor registra el sello solo si ancla, evidencia y sal coinciden',async()=>{
 const {engine,provider,dirs,municipio,deploy,close}=await setup();
 try {
  const ok=await deploy();await registrarPeriodo({provider,...ok,...local,publicRpc:'x',dirs});
  const texts=Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async([k,f])=>[k,await fs.readFile(new URL('../datos/'+f,import.meta.url),'utf8')])));
  const baseline=JSON.parse(await fs.readFile(new URL('../src/originals.json',import.meta.url),'utf8'));
  const salt=newSalt();await guardarSal({address:ok.address,salt,dirs});
  const evidence=await buildEvidence(texts,baseline,salt);
  // Una evidencia con otra sal no se acepta.
  const ajena=await buildEvidence(texts,baseline,newSalt());
  const tx=await new Contract(ok.address,ABI,municipio).seal(PERIOD,evidence.root,await evidenceHash(evidence),evidence.count);await tx.wait();
  await assert.rejects(registrarSello({provider,transactionHash:tx.hash,evidence:ajena,dirs,intentos:2,pausa:10}),/no corresponde/);
  const sealed=await registrarSello({provider,transactionHash:tx.hash,evidence,dirs,intentos:2,pausa:10});
  assert.equal(sealed.sealTransaction,tx.hash);assert.ok(sealed.sealBlock);
  assert.equal(sealed.links.seal,`https://sepolia.etherscan.io/tx/${tx.hash}`);
  // Un lector sin billetera verifica VERDE con la configuración guardada y la sal del contrato.
  const reader=new BrowserProvider(engine,undefined,{cacheTimeout:-1}),anchor=await readAnchor(reader,sealed);
  assert.equal((await verifyText(texts.tickets,evidence,anchor,texts,await leerSal(dirs))).status,'VERDE');
  const publico=JSON.stringify(sealed)+await fs.readFile(path.join(dirs.evidenceDir,'sello-sepolia.json'),'utf8');
  assert.ok(!publico.includes(salt.slice(2)),'la sal no está en la configuración ni en la evidencia públicas');
 }finally{await close();}
});
