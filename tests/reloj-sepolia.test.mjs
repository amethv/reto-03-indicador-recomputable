// Nivel 2 real: lotes del contrato, validación del despliegue hecho con MetaMask y flujo municipio → proveedor
// con dos cuentas distintas. MetaMask no se automatiza: el navegador se reemplaza por firmantes de Ganache.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract} from 'ethers';
import {loadArtifact} from '../scripts/runtime.mjs';
import {loadRelojArtifact} from '../scripts/reloj.mjs';
import {validarReloj,registrarReloj,archivarReloj,readRelojSepolia,argsSepolia,proveedor1} from '../scripts/reloj-sepolia.mjs';
import {ABI_RELOJ,idHash,parseProveedores,parseCasos,constructorArgs,recalcularComoTercero} from '../src/reloj.mjs';
import {leerReloj,rolDeCuenta,estadoCasos,firmarRespuestas,nuevoContrato,usd} from '../portal-proveedor/logica.js';
import {POLICY,sha} from '../src/core.mjs';

const read=f=>fs.readFile(new URL(`../datos/${f}`,import.meta.url),'utf8');
const PROVEEDORES=parseProveedores(await read('proveedores.csv')),CASOS=parseCasos(await read('tickets_proveedor.csv'));
const local={expectedChainId:31337};
const ids=cs=>cs.map(c=>idHash(c.id)),provs=cs=>cs.map(c=>idHash(c.proveedorId));

async function setup(){
 const engine=ganache.provider({wallet:{deterministic:true,totalAccounts:8},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const s=await Promise.all([0,1,2,5,6].map(i=>provider.getSigner(i)));
 // municipio (cuenta 0) y proveedor 1 en OTRA billetera (cuenta 5); 1 y 2 son PV-01 y PV-02 del despliegue local.
 const [municipio,pv01,pv02,proveedorReal,otra]=s;
 const artifact=await loadRelojArtifact();
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'reloj-sepolia-')),dirs={evidenceDir:path.join(base,'evidencias')};
 const deploySepolia=async(cuenta=proveedorReal.address,signer=municipio,args=null)=>{const p=await proveedor1();const c=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(...(args??argsSepolia(p,cuenta)));await c.waitForDeployment();return {contract:c,address:await c.getAddress(),deploymentTransaction:c.deploymentTransaction().hash};};
 return {engine,provider,artifact,municipio,pv01,pv02,proveedorReal,otra,dirs,deploySepolia,close:async()=>{provider.destroy();await engine.disconnect();await fs.rm(base,{recursive:true,force:true});}};
}

test('lotes: abrirCasos y responderCasos mantienen todas las reglas y dan 2.592 USD',async()=>{
 const {provider,artifact,municipio,pv01,pv02,close}=await setup();
 try {
  const k=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy(...constructorArgs(PROVEEDORES,[pv01.address,pv02.address]));await k.waitForDeployment();
  const desde=(await k.deploymentTransaction().wait()).blockNumber,aperturas=CASOS.map(c=>c.apertura);
  // Solo el municipio abre; lotes de largo distinto o vacíos no se aceptan.
  await assert.rejects(k.connect(pv01).abrirCasos.staticCall(ids(CASOS),provs(CASOS),aperturas),/Solo el municipio abre casos/);
  await assert.rejects(k.connect(municipio).abrirCasos.staticCall(ids(CASOS),provs(CASOS).slice(1),aperturas),/Lote invalido/);
  await assert.rejects(k.connect(municipio).abrirCasos.staticCall([],[],[]),/Lote invalido/);
  // Antes de abrir: el proveedor no puede responder.
  await assert.rejects(k.connect(pv01).responderCasos.staticCall([idHash('PVT-04244')],[CASOS[1].respuesta]),/Caso no abierto/);
  // Una sola transacción del municipio abre los 9 casos (9 eventos CasoAbierto).
  const rc=await (await k.connect(municipio).abrirCasos(ids(CASOS),provs(CASOS),aperturas)).wait();
  assert.equal(rc.logs.length,9);
  for(const c of CASOS){const e=await k.casos(idHash(c.id));assert.equal(e.abierto,true);assert.equal(Number(e.apertura),c.apertura);}
  // Abrir dos veces: el lote entero se revierte.
  await assert.rejects(k.connect(municipio).abrirCasos.staticCall([idHash(CASOS[0].id)],[idHash('PV-01')],[CASOS[0].apertura]),/Caso ya abierto/);
  const validos=CASOS.filter(c=>c.id!=='PVT-04226'),pvt=CASOS.find(c=>c.id==='PVT-04226');
  // Respuesta anterior a la apertura dentro de un lote: se revierte todo el lote, nada queda respondido.
  await assert.rejects(k.connect(pv01).responderCasos.staticCall(ids(CASOS),CASOS.map(c=>c.respuesta)),/Respuesta anterior a la apertura/);
  await assert.rejects(k.connect(pv01).responderCasos(ids(CASOS),CASOS.map(c=>c.respuesta)));
  assert.equal((await k.casos(idHash(validos[0].id))).respondido,false);
  // Ni el municipio ni PV-02 responden casos de PV-01.
  await assert.rejects(k.connect(municipio).responderCasos.staticCall(ids(validos),validos.map(c=>c.respuesta)),/Solo el proveedor del caso responde/);
  await assert.rejects(k.connect(pv02).responderCasos.staticCall(ids(validos),validos.map(c=>c.respuesta)),/Solo el proveedor del caso responde/);
  await assert.rejects(k.connect(pv01).responderCasos.staticCall(ids(validos),validos.slice(1).map(c=>c.respuesta)),/Lote invalido/);
  // El proveedor 1 responde los 8 válidos en una sola transacción.
  const rr=await (await k.connect(pv01).responderCasos(ids(validos),validos.map(c=>c.respuesta))).wait();
  assert.equal(rr.logs.length,8);
  await assert.rejects(k.connect(pv01).responderCasos.staticCall([idHash(validos[0].id)],[validos[0].respuesta]),/Caso ya respondido/);
  await assert.rejects(k.connect(pv01).responder.staticCall(idHash(pvt.id),pvt.respuesta),/Respuesta anterior a la apertura/);
  // Lo mismo que con las funciones de un caso: 2.592 USD, y un tercero sin llaves coincide desde los eventos.
  let total=0n;for(const c of validos)total+=await k.penalidad(idHash(c.id));
  assert.equal(total,259200n);assert.equal(usd(total),'2.592 USD');
  const t=await recalcularComoTercero(provider,await k.getAddress(),desde);assert.equal(t.total,259200n);assert.equal(t.coincide,true);
 }finally{await close();}
});

test('preparar reloj: el servidor acepta el RelojProveedor correcto y rechaza bytecode, argumentos, red y dirección sin código',async()=>{
 const {provider,artifact,municipio,proveedorReal,dirs,deploySepolia,close}=await setup();
 try {
  const ok=await deploySepolia();
  const v=await validarReloj({provider,...ok,proveedor:proveedorReal.address,...local});
  assert.equal(v.municipio,municipio.address);assert.deepEqual(v.proveedor,{id:'PV-01',cuenta:proveedorReal.address,slaSegundos:21600,tarifaCentavosPorHora:18000});
  // Otro contrato (RegistroIndicador) en la dirección.
  const ri=await loadArtifact(),otro=await new ContractFactory(ri.abi,ri.bytecode,municipio).deploy(await sha(JSON.stringify(POLICY)));await otro.waitForDeployment();
  await assert.rejects(validarReloj({provider,address:await otro.getAddress(),deploymentTransaction:otro.deploymentTransaction().hash,proveedor:proveedorReal.address,...local}),/no coincide con RelojProveedor/);
  // Mismo bytecode con otros argumentos: otro SLA, o una cuenta del proveedor distinta de la declarada.
  const sla=await deploySepolia(undefined,municipio,[[idHash('PV-01')],[proveedorReal.address],[3600],[18000]]);
  await assert.rejects(validarReloj({provider,...sla,proveedor:proveedorReal.address,...local}),/proveedor 1, su SLA y su tarifa/);
  await assert.rejects(validarReloj({provider,...ok,proveedor:(await provider.getSigner(7)).address,...local}),/proveedor 1, su SLA y su tarifa/);
  // Red equivocada, dirección sin código, transacción ajena y municipio fijado en el servidor.
  await assert.rejects(validarReloj({provider,...ok,proveedor:proveedorReal.address}),/Red equivocada/);
  await assert.rejects(validarReloj({provider,address:'0x000000000000000000000000000000000000dEaD',deploymentTransaction:ok.deploymentTransaction,proveedor:proveedorReal.address,...local}),/no tiene código/);
  await assert.rejects(validarReloj({provider,address:ok.address,deploymentTransaction:sla.deploymentTransaction,proveedor:proveedorReal.address,...local}),/no es el despliegue/);
  await assert.rejects(validarReloj({provider,...ok,proveedor:proveedorReal.address,...local,admin:proveedorReal.address}),/Solo la cuenta del municipio/);
  // El contrato no deja registrar al municipio como proveedor.
  const p1=await proveedor1(),creacion=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).getDeployTransaction(...argsSepolia(p1,municipio.address));
  await assert.rejects(municipio.call(creacion),/Proveedor invalido/);await assert.rejects(deploySepolia(municipio.address));
  assert.equal(await readRelojSepolia(dirs),null,'nada de lo rechazado se guardó');
  // Registrar, y un reloj nuevo archiva el anterior en el historial (nada se borra).
  const c1=await registrarReloj({provider,...ok,proveedor:proveedorReal.address,...local,publicRpc:'x',dirs});
  assert.equal(c1.address,ok.address);assert.equal(c1.proveedores[0].cuenta,proveedorReal.address);assert.equal(c1.local,false);
  const ok2=await deploySepolia();const c2=await registrarReloj({provider,...ok2,proveedor:proveedorReal.address,...local,publicRpc:'x',dirs});
  assert.ok(c2.previous.startsWith('reloj-sepolia-historial/'));
  const hist=await fs.readdir(path.join(dirs.evidenceDir,'reloj-sepolia-historial'));assert.equal(hist.length,1);assert.ok(hist[0].endsWith(ok.address));
  // npm run presentacion: archiva el reloj activo y deja la app sin reloj.
  assert.ok(await archivarReloj(dirs));assert.equal(await readRelojSepolia(dirs),null);
  assert.equal((await fs.readdir(path.join(dirs.evidenceDir,'reloj-sepolia-historial'))).length,2);
  assert.equal(await archivarReloj(dirs),null);
 }finally{await close();}
});

test('flujo municipio → proveedor con dos cuentas distintas: una firma de apertura, una de respuestas, PVT-04226 sin gas',async()=>{
 const {provider,municipio,proveedorReal,otra,deploySepolia,close}=await setup();
 try {
  const {address}=await deploySepolia();
  // Municipio (su app): abre los 9 casos con UNA firma.
  const k=new Contract(address,ABI_RELOJ,municipio),antes=await provider.getBlockNumber();
  await (await k.abrirCasos(ids(CASOS),provs(CASOS),CASOS.map(c=>c.apertura))).wait();
  assert.equal(await provider.getBlockNumber(),antes+1,'una sola transacción del municipio');
  // Proveedor (portal, otro programa): lee el contrato con un lector sin llaves.
  const lector=nuevoContrato(address,provider),reloj=await leerReloj(lector);
  assert.deepEqual([reloj.municipio,reloj.cuenta],[municipio.address,proveedorReal.address]);
  assert.equal(rolDeCuenta(proveedorReal.address,reloj),'proveedor');assert.equal(rolDeCuenta(municipio.address,reloj),'municipio');assert.equal(rolDeCuenta(otra.address,reloj),'otra');
  // Respuestas del registro propio del proveedor (portal-proveedor/casos-pv01.json): las mismas del CSV.
  const propios=JSON.parse(await fs.readFile(new URL('../portal-proveedor/casos-pv01.json',import.meta.url),'utf8')).casos;
  assert.deepEqual(propios.map(c=>[c.id,c.respuesta]),CASOS.map(c=>[c.id,c.respuesta]));
  // Simulación sin gas: 8 válidos y PVT-04226 rechazado con el motivo del contrato; no se mina nada.
  const bloque=await provider.getBlockNumber(),e=await estadoCasos(lector,propios,reloj.cuenta);
  assert.equal(await provider.getBlockNumber(),bloque,'staticCall no envía transacciones');
  assert.deepEqual([e.abiertos,e.validos,e.rechazados,e.respondidos],[9,8,1,0]);
  assert.deepEqual(e.filas.filter(f=>f.estado==='RECHAZADO').map(f=>[f.id,f.motivo]),[['PVT-04226','Respuesta anterior a la apertura']]);
  // La llave del municipio o una cuenta ajena no pueden responder.
  const bloqueLlaves=await provider.getBlockNumber();
  await assert.rejects(firmarRespuestas(nuevoContrato(address,municipio),e),/rechazaría el lote: Solo el proveedor del caso responde/);
  await assert.rejects(firmarRespuestas(nuevoContrato(address,otra),e),/rechazaría el lote: Solo el proveedor del caso responde/);
  assert.equal(await provider.getBlockNumber(),bloqueLlaves,'con otra llave no se envía nada');
  // El proveedor firma con SU cuenta: un solo lote con los 8 válidos.
  const r=await firmarRespuestas(nuevoContrato(address,proveedorReal),e);
  assert.equal(r.enviados.length,8);assert.ok(!r.enviados.includes('PVT-04226'));assert.equal(await provider.getBlockNumber(),bloque+1);
  const tx=await provider.getTransaction(r.tx);assert.equal(tx.from,proveedorReal.address);
  // Después: penalidades leídas del contrato; el municipio ve lo mismo leyendo la cadena.
  const d=await estadoCasos(lector,propios,reloj.cuenta);
  assert.deepEqual([d.respondidos,d.rechazados,d.validos],[8,1,0]);assert.equal(d.total,259200n);
  const pen=Object.fromEntries(d.filas.filter(f=>f.penalidad!==null).map(f=>[f.id,f.penalidad]));
  assert.deepEqual([pen['PVT-04244'],pen['PVT-04288'],pen['PVT-04326'],pen['PVT-04367'],pen['PVT-04301']],[95400n,34200n,95400n,34200n,0n]);
  await assert.rejects(firmarRespuestas(nuevoContrato(address,proveedorReal),d),/No hay respuestas válidas/);
 }finally{await close();}
});
