// Nivel 1: el sello se valida por el evento Sealed del propio contrato y su almacenamiento, no por la forma de la
// transacción. Así vale con una cuenta estándar (envío directo) y con una cuenta inteligente de MetaMask (EIP-7702),
// que envía la llamada a través de otro contrato. Se siguen rechazando el sello ajeno y el evento de un impostor.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,AbiCoder,keccak256} from 'ethers';
import {loadArtifact} from '../scripts/runtime.mjs';
import {guardarSal,registrarSello,readSepoliaConfig} from '../scripts/sepolia-web.mjs';
import {ABI,readAnchor} from '../src/chain.mjs';
import {POLICY,PERIOD,SOURCES,sha,newSalt,buildEvidence,evidenceHash,verifyText} from '../src/core.mjs';

// «Reenviador»: hace de cuenta inteligente. Despliega el contrato (queda como owner) y llama por dentro.
// «Impostor»: emite un evento con la misma firma que Sealed desde otra dirección.
const FUENTE=`// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
contract Reenviador {
 function crear(bytes memory codigo) external returns (address a) { assembly { a := create(0, add(codigo, 0x20), mload(codigo)) } require(a != address(0), "crear"); }
 function ejecutar(address destino, bytes calldata datos) external { (bool ok, bytes memory r) = destino.call(datos); if (!ok) { assembly { revert(add(r, 32), mload(r)) } } }
}
contract Impostor {
 event Sealed(uint32 indexed period, bytes32 root, bytes32 evidenceHash, uint32 count);
 function emitir(uint32 p, bytes32 r, bytes32 e) external { emit Sealed(p, r, e, 187); }
}`;
const {default:solc}=await import('solc');
const compilado=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'P.sol':{content:FUENTE}},settings:{evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}))).contracts['P.sol'];
const TEXTS=Object.fromEntries(await Promise.all(Object.entries(SOURCES).map(async([k,f])=>[k,await fs.readFile(new URL('../datos/'+f,import.meta.url),'utf8')])));
const BASELINE=JSON.parse(await fs.readFile(new URL('../src/originals.json',import.meta.url),'utf8'));

async function setup(){
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const municipio=await provider.getSigner(0),artifact=await loadArtifact(),rules=await sha(JSON.stringify(POLICY));
 const creation=artifact.bytecode+AbiCoder.defaultAbiCoder().encode(['bytes32'],[rules]).slice(2);
 const fabrica=async(nombre)=>{const c=await new ContractFactory(compilado[nombre].abi,compilado[nombre].evm.bytecode.object,municipio).deploy();await c.waitForDeployment();return c;};
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'sello-ruteado-')),dirs={evidenceDir:path.join(base,'evidencias'),secretDir:path.join(base,'.secreto')};
 // Configuración como la que guarda registrarPeriodo (red, dirección y hash del bytecode).
 const configDe=async(address,deploymentBlock)=>({network:'prueba',chainId:31337,address,deploymentBlock,codeHash:keccak256(await provider.getCode(address)),rulesHash:rules,evidenceFile:'sello-sepolia.json',explorer:'https://sepolia.etherscan.io',local:false});
 return {engine,provider,municipio,artifact,creation,fabrica,dirs,configDe,close:async()=>{provider.destroy();await engine.disconnect();await fs.rm(base,{recursive:true,force:true});}};
}
const escribirConfig=async(dirs,config)=>{await fs.mkdir(dirs.evidenceDir,{recursive:true});await fs.writeFile(path.join(dirs.evidenceDir,'red-sepolia.json'),JSON.stringify(config));};

test('sello directo (cuenta estándar): se lee, la calldata se sigue comprobando y verifica VERDE',async()=>{
 const {provider,municipio,artifact,configDe,close}=await setup();
 try {
  const c=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy(await sha(JSON.stringify(POLICY)));await c.waitForDeployment();
  const config=await configDe(await c.getAddress(),(await c.deploymentTransaction().wait()).blockNumber);
  const salt=newSalt(),ev=await buildEvidence(TEXTS,BASELINE,salt);
  const rc=await (await c.seal(PERIOD,ev.root,await evidenceHash(ev),187)).wait();assert.equal(rc.to,config.address);
  const anchor=await readAnchor(provider,{...config,sealBlock:rc.blockNumber});
  assert.equal(anchor.root,ev.root);assert.equal(anchor.count,187);assert.equal(anchor.transactionHash,rc.hash);assert.equal(anchor.calldata.length,2+(4+4*32)*2);
  assert.equal((await verifyText(TEXTS.tickets,ev,anchor,TEXTS,salt)).status,'VERDE');
 }finally{await close();}
});

test('sello a través de otro contrato (cuenta inteligente, EIP-7702): se lee, se registra y verifica VERDE',async()=>{
 const {engine,provider,creation,fabrica,dirs,configDe,close}=await setup();
 try {
  const fwd=await fabrica('Reenviador'),address=await fwd.crear.staticCall(creation),dep=await (await fwd.crear(creation)).wait();
  const k=new Contract(address,ABI,provider);assert.equal(await k.owner(),await fwd.getAddress(),'el owner es la «cuenta inteligente»');
  const config=await configDe(address,dep.blockNumber);await escribirConfig(dirs,config);
  const salt=newSalt();await guardarSal({address,salt,dirs});const ev=await buildEvidence(TEXTS,BASELINE,salt);
  // La transacción va al reenviador; el evento Sealed lo emite el contrato del sello.
  const rc=await (await fwd.ejecutar(address,k.interface.encodeFunctionData('seal',[PERIOD,ev.root,await evidenceHash(ev),187]))).wait();
  assert.notEqual(rc.to,address);assert.equal(rc.logs.filter(l=>l.address===address).length,1);
  // Antes del arreglo: «Recibo de sellado no confirmado» y «La transacción no es un sello confirmado de este contrato».
  const anchor=await readAnchor(provider,{...config,sealBlock:rc.blockNumber});
  assert.equal(anchor.root,ev.root);assert.equal(anchor.evidenceHash,await evidenceHash(ev));assert.equal(anchor.count,187);assert.equal(anchor.transactionHash,rc.hash);
  const sellado=await registrarSello({provider,transactionHash:rc.hash,evidence:ev,dirs,intentos:2,pausa:10});
  assert.equal(sellado.sealTransaction,rc.hash);assert.equal(sellado.sealBlock,rc.blockNumber);
  // Un lector sin billetera verifica VERDE con la configuración guardada.
  const lector=new BrowserProvider(engine,undefined,{cacheTimeout:-1});
  assert.equal((await verifyText(TEXTS.tickets,ev,await readAnchor(lector,sellado),TEXTS,salt)).status,'VERDE');
 }finally{await close();}
});

test('se sigue rechazando: sello de otro contrato, evento de un impostor y compromiso distinto del contrato',async()=>{
 const {provider,municipio,artifact,creation,fabrica,dirs,configDe,close}=await setup();
 try {
  const rules=await sha(JSON.stringify(POLICY)),desplegar=async()=>{const c=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy(rules);await c.waitForDeployment();return {c,address:await c.getAddress(),block:(await c.deploymentTransaction().wait()).blockNumber};};
  const A=await desplegar(),B=await desplegar(),config=await configDe(A.address,A.block);await escribirConfig(dirs,config);
  const salt=newSalt();await guardarSal({address:A.address,salt,dirs});const ev=await buildEvidence(TEXTS,BASELINE,salt),eh=await evidenceHash(ev);
  // Sello ajeno: B sellado con la misma evidencia; A sigue sin sello.
  const ajeno=await (await B.c.seal(PERIOD,ev.root,eh,187)).wait();
  await assert.rejects(registrarSello({provider,transactionHash:ajeno.hash,evidence:ev,dirs,intentos:2,pausa:10}),/no es un sello confirmado de este contrato/);
  await assert.rejects(readAnchor(provider,{...config,sealBlock:ajeno.blockNumber}),/No existe sello confirmado/);
  // Sello ajeno a través del reenviador (otro contrato que él mismo desplegó).
  const fwd=await fabrica('Reenviador'),C=await fwd.crear.staticCall(creation);await (await fwd.crear(creation)).wait();
  const ruteadoAjeno=await (await fwd.ejecutar(C,new Contract(C,ABI).interface.encodeFunctionData('seal',[PERIOD,ev.root,eh,187]))).wait();
  await assert.rejects(registrarSello({provider,transactionHash:ruteadoAjeno.hash,evidence:ev,dirs,intentos:2,pausa:10}),/no es un sello confirmado de este contrato/);
  // Impostor: emite «Sealed» con la misma firma desde otra dirección; no cuenta.
  const imp=await fabrica('Impostor'),falso=await (await imp.emitir(PERIOD,ev.root,eh)).wait();
  await assert.rejects(registrarSello({provider,transactionHash:falso.hash,evidence:ev,dirs,intentos:2,pausa:10}),/no es un sello confirmado de este contrato/);
  // Ahora A sí se sella, pero con otra evidencia: la evidencia presentada no corresponde al contrato.
  const otraEv=await buildEvidence(TEXTS,BASELINE,newSalt());
  const propio=await (await A.c.seal(PERIOD,otraEv.root,await evidenceHash(otraEv),187)).wait();
  await assert.rejects(registrarSello({provider,transactionHash:propio.hash,evidence:ev,dirs,intentos:2,pausa:10}),/no corresponde al sello/);
  assert.equal((await readSepoliaConfig(dirs)).sealTransaction,undefined,'nada se registró');
  // Un único sello por período: el contrato no deja sellar dos veces, directo ni por otro contrato.
  await assert.rejects(A.c.seal.staticCall(PERIOD,ev.root,eh,187));
 }finally{await close();}
});
