// Nivel 2 · Reloj del proveedor: el municipio abre, el proveedor responde, cualquiera recalcula.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Interface,hexlify,toUtf8Bytes} from 'ethers';
import {compileReloj,loadRelojArtifact} from '../scripts/reloj.mjs';
import {ABI_RELOJ,idHash,parseProveedores,parseCasos,constructorArgs,penalidadCentavos,cargarCasos,recalcularComoTercero} from '../src/reloj.mjs';
import {csv} from '../src/core.mjs';
import {searchPersonalData} from '../src/privacy.mjs';

const read=f=>fs.readFile(new URL(`../datos/${f}`,import.meta.url),'utf8');
const proveedoresText=await read('proveedores.csv'),casosText=await read('tickets_proveedor.csv');
const PROVEEDORES=parseProveedores(proveedoresText),CASOS=parseCasos(casosText);
const ESPERADO={'PVT-04244':95400n,'PVT-04288':34200n,'PVT-04326':95400n,'PVT-04367':34200n};

async function setup(){
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const artifact=await loadRelojArtifact(),[municipio,pv01,pv02,otro]=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i)));
 const cuentas=[await pv01.getAddress(),await pv02.getAddress()];
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy(...constructorArgs(PROVEEDORES,cuentas));await contract.waitForDeployment();
 const deployBlock=(await contract.deploymentTransaction().wait()).blockNumber,address=await contract.getAddress();
 const signerFor=id=>({'PV-01':pv01,'PV-02':pv02})[id];
 return {engine,provider,artifact,contract,address,deployBlock,municipio,pv01,pv02,otro,signerFor,close:async()=>{provider.destroy();await engine.disconnect();}};
}
// El motivo del revert se lee con staticCall; además se comprueba que la transacción real falla.
async function reverts(fn,args,reason){await assert.rejects(fn.staticCall(...args),reason);await assert.rejects(fn(...args));}
const caso=id=>CASOS.find(c=>c.id===id);

test('reloj: datos de entrada (9 casos de PV-01; PV-01 6 h y 18000 c/h; PV-02 4 h y 24000 c/h)',()=>{
 assert.equal(CASOS.length,9);assert.ok(CASOS.every(c=>c.proveedorId==='PV-01'));
 assert.deepEqual(PROVEEDORES,[{id:'PV-01',slaSegundos:21600,tarifaCentavosPorHora:18000},{id:'PV-02',slaSegundos:14400,tarifaCentavosPorHora:24000}]);
});

test('reloj (1, 2 y 3): de 9 casos, 8 aceptados y PVT-04226 rechazado; penalidades y total 2.592 USD',async()=>{
 const {contract,municipio,pv01,signerFor,close}=await setup();
 try {
  const pasos=[];const r=await cargarCasos(contract,municipio,signerFor,CASOS,p=>pasos.push(p));
  assert.equal(r.filter(x=>x.estado==='ACEPTADO').length,8);
  assert.deepEqual(r.filter(x=>x.estado==='RECHAZADO').map(x=>[x.id,x.motivo]),[['PVT-04226','Respuesta anterior a la apertura']]);
  // Cada paso lo firma la cuenta que corresponde: apertura el municipio, respuesta el proveedor.
  assert.ok(pasos.filter(p=>p.paso==='apertura').every(p=>p.cuenta===municipio.address));
  assert.ok(pasos.filter(p=>p.paso==='respuesta').every(p=>p.cuenta===pv01.address));
  // (2) El revert lleva el motivo exacto y el caso queda abierto sin respuesta.
  const c=caso('PVT-04226');
  await reverts(contract.connect(pv01).responder,[idHash(c.id),c.respuesta],/Respuesta anterior a la apertura/);
  const estado=await contract.casos(idHash(c.id));assert.equal(estado.abierto,true);assert.equal(estado.respondido,false);
  await assert.rejects(contract.penalidad.staticCall(idHash(c.id)),/Caso sin respuesta/);
  // (3) Penalidades del contrato frente a lo esperado y frente a la fórmula.
  let total=0n;
  for(const x of r.filter(x=>x.estado==='ACEPTADO')){
   const esperado=ESPERADO[x.id]??0n;assert.equal(x.penalidadContrato,esperado,x.id);total+=x.penalidadContrato;
   const d=caso(x.id),p=PROVEEDORES[0];assert.equal(penalidadCentavos(d.apertura,d.respuesta,p.slaSegundos,p.tarifaCentavosPorHora),esperado);
   assert.equal(x.penalidadContrato,BigInt(d.declarado.penalidadCentavos),`${x.id}: coincide con lo que declaraba el CSV`);
  }
  assert.equal(total,259200n);
  // El CSV declaraba PVT-04226 como cumplido con 0 USD y -1,42 h: el contrato no lo acepta.
  assert.deepEqual([c.declarado.horas,c.declarado.cumple,c.declarado.penalidadCentavos],[-1.42,'SI',0]);
 }finally{await close();}
});

test('reloj (4): un tercero recalcula lo mismo solo con los eventos, sin llaves ni CSV',async()=>{
 const {engine,contract,address,deployBlock,municipio,signerFor,close}=await setup();
 try {
  await cargarCasos(contract,municipio,signerFor,CASOS);
  // Proveedor de solo lectura sobre la misma cadena: no se pide ningún firmante.
  const lector=new BrowserProvider(engine,undefined,{cacheTimeout:-1});
  const t=await recalcularComoTercero(lector,address,deployBlock);
  assert.equal(t.casos.length,9);assert.equal(t.total,259200n);assert.equal(t.totalContrato,259200n);assert.equal(t.coincide,true);
  const porId=new Map(CASOS.map(c=>[idHash(c.id),c.id]));
  const pen=Object.fromEntries(t.casos.filter(c=>c.penalidad!==null).map(c=>[porId.get(c.casoId),c.penalidad]));
  for(const c of CASOS)if(c.id!=='PVT-04226')assert.equal(pen[c.id],ESPERADO[c.id]??0n,c.id);
  const rechazado=t.casos.find(c=>porId.get(c.casoId)==='PVT-04226');assert.equal(rechazado.respuesta,null);assert.equal(rechazado.coincide,null);
  assert.equal(t.casos.find(c=>porId.get(c.casoId)==='PVT-04244').horas,11.3);
 }finally{await close();}
});

test('reloj (5): el municipio no responde, el proveedor no abre y PV-02 no responde un caso de PV-01',async()=>{
 const {contract,municipio,pv01,pv02,otro,close}=await setup();
 try {
  const c=caso('PVT-04244'),id=idHash(c.id),pv=idHash('PV-01');
  await reverts(contract.connect(pv01).abrirCaso,[id,pv,c.apertura],/Solo el municipio abre casos/);
  await reverts(contract.connect(otro).abrirCaso,[id,pv,c.apertura],/Solo el municipio abre casos/);
  await reverts(contract.connect(municipio).abrirCaso,[id,idHash('PV-99'),c.apertura],/Proveedor desconocido/);
  await (await contract.connect(municipio).abrirCaso(id,pv,c.apertura)).wait();
  await reverts(contract.connect(municipio).responder,[id,c.respuesta],/Solo el proveedor del caso responde/);
  await reverts(contract.connect(pv02).responder,[id,c.respuesta],/Solo el proveedor del caso responde/);
  await reverts(contract.connect(pv01).responder,[idHash('PVT-00000'),c.respuesta],/Caso no abierto/);
  await (await contract.connect(pv01).responder(id,c.respuesta)).wait();
  assert.equal(await contract.penalidad(id),95400n);
 }finally{await close();}
});

test('reloj (6): no se puede abrir ni responder dos veces',async()=>{
 const {contract,municipio,pv01,close}=await setup();
 try {
  const c=caso('PVT-04288'),id=idHash(c.id),pv=idHash('PV-01');
  await (await contract.connect(municipio).abrirCaso(id,pv,c.apertura)).wait();
  await reverts(contract.connect(municipio).abrirCaso,[id,pv,c.apertura],/Caso ya abierto/);
  await reverts(contract.connect(municipio).abrirCaso,[id,pv,c.apertura-3600],/Caso ya abierto/);
  await (await contract.connect(pv01).responder(id,c.respuesta)).wait();
  await reverts(contract.connect(pv01).responder,[id,c.respuesta],/Caso ya respondido/);
  await reverts(contract.connect(pv01).responder,[id,c.apertura],/Caso ya respondido/);
  const e=await contract.casos(id);assert.equal(Number(e.apertura),c.apertura);assert.equal(Number(e.respuesta),c.respuesta);
 }finally{await close();}
});

test('reloj (7): ningún texto de proveedores.csv aparece en calldata ni en eventos',async()=>{
 const {provider,contract,address,municipio,signerFor,close}=await setup();
 try {
  await cargarCasos(contract,municipio,signerFor,CASOS);
  const blobs=[],latest=await provider.getBlockNumber();
  for(let n=0;n<=latest;n++){const b=await provider.getBlock(n,true);for(const tx of b.prefetchedTransactions)blobs.push({source:`calldata ${tx.hash}`,hex:tx.data});}
  for(const l of await provider.getLogs({address,fromBlock:0,toBlock:'latest'}))blobs.push({source:`evento ${l.transactionHash}`,hex:'0x'+[...l.topics,l.data].map(h=>h.slice(2)).join('')});
  assert.ok(blobs.length>=1+9+8+9+8+2);
  // Nombres, servicio, contrato y contacto: ni en texto ni como SHA-256 o keccak256.
  const rows=csv(proveedoresText).rows,values=[];
  for(const r of rows)for(const k of ['razon_social','servicio_contratado','contrato','contacto'])values.push({value:r[k],kind:k});
  const result=await searchPersonalData(blobs,values);
  assert.deepEqual(result.matches,[]);assert.equal(result.searched,8);
  // El id del proveedor solo va como keccak256 (su identificador declarado), nunca en texto.
  const textos=[...rows.map(r=>r.proveedor_id),...CASOS.map(c=>c.id),...CASOS.map(c=>c.ticket)];
  for(const t of textos)for(const b of blobs)assert.ok(!b.hex.toLowerCase().includes(hexlify(toUtf8Bytes(t)).slice(2)),`${t} en ${b.source}`);
 }finally{await close();}
});

test('reloj: el ABI de src/reloj.mjs coincide con el contrato precompilado',async()=>{
 const saved=await loadRelojArtifact(),a=new Interface(ABI_RELOJ),b=new Interface(saved.abi);
 const firmas=i=>i.fragments.map(f=>f.format('full')).sort();
 assert.deepEqual(firmas(a),firmas(b));
});

test('reloj precompilado: recompilar da el mismo bytecode, abi e input estándar',async()=>{
 const saved=await loadRelojArtifact(),fresh=await compileReloj();
 assert.equal(fresh.bytecode,saved.bytecode);assert.equal(fresh.deployedBytecode,saved.deployedBytecode);
 assert.deepEqual(fresh.abi,saved.abi);assert.deepEqual(fresh.input,saved.input);assert.equal(fresh.compiler,saved.compiler);
 assert.match(saved.compiler,/^0\.8\.30\+commit\./);assert.equal(saved.input.settings.evmVersion,'shanghai');
 assert.deepEqual(saved.input.settings.optimizer,{enabled:true,runs:200});
});
