// Nivel 3 · Catálogo y SLA anclados: anclaje único, sin reclasificación, solo el owner, lectura de los 14
// servicios, detección de un catálogo editado y validación del despliegue hecho con MetaMask.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Interface,encodeBytes32String} from 'ethers';
import {compileCatalogo,loadCatalogoArtifact} from '../scripts/catalogo.mjs';
import {loadRelojArtifact} from '../scripts/reloj.mjs';
import {validarCatalogo,registrarCatalogo,readCatalogoSepolia,archivarCatalogo} from '../scripts/catalogo-sepolia.mjs';
import {ABI_CATALOGO,PERIODO_CATALOGO,RECHAZO_RECLASIFICAR,argumentosAnclaje,argsContrato,leerAnclado,compararCatalogo,ticketsAfectados,reclasificar,intentarReclasificar,leerCatalogo} from '../src/catalogo.mjs';
import {sha} from '../src/core.mjs';

const leer=f=>fs.readFile(new URL(`../datos/${f}`,import.meta.url),'utf8');
const CATALOGO=await leer('catalogo_servicios.csv'),TICKETS=await leer('tickets.csv'),BITACORA=await leer('bitacora_eventos.csv');
const local={expectedChainId:31337};

async function setup(){
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const [municipio,otra]=await Promise.all([0,1].map(i=>provider.getSigner(i))),artifact=await loadCatalogoArtifact();
 const desplegar=async(signer=municipio)=>{const c=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy();await c.waitForDeployment();return {contract:c,address:await c.getAddress(),deploymentTransaction:c.deploymentTransaction().hash};};
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'catalogo-')),dirs={evidenceDir:path.join(base,'evidencias')};
 return {provider,municipio,otra,artifact,desplegar,dirs,close:async()=>{provider.destroy();await engine.disconnect();await fs.rm(base,{recursive:true,force:true});}};
}

test('catálogo: datos de entrada (14 servicios, SHA-256 oficial, CS-11 CRÍTICA 4 h)',async()=>{
 const a=await argumentosAnclaje(CATALOGO);
 assert.equal(a.filas.length,14);assert.equal(a.csvSha256,'0xad088fc60f9fb27a240688564afb78ac9623780460f773c71094bb9ee6bd6942');
 assert.deepEqual(a.filas.find(f=>f.id==='CS-11'),{id:'CS-11',nombre:'Intento de acceso no autorizado',prioridad:'CRITICA',sla:4});
 assert.throws(()=>leerCatalogo('a,b\n1,2\n'),/no es un catálogo de servicios válido/);
});

test('catálogo: anclaje único, sin reclasificar, solo el owner y lectura de los 14 servicios',async()=>{
 const {provider,municipio,otra,desplegar,close}=await setup();
 try {
  const {contract:k}=await desplegar(),a=await argumentosAnclaje(CATALOGO);
  assert.equal((await leerAnclado(k)).anclado,false);
  // Solo el owner (el municipio) ancla.
  await assert.rejects(k.connect(otra).anclarCatalogo.staticCall(...argsContrato(a)),/Solo el municipio ancla el catalogo/);
  await assert.rejects(k.connect(otra).anclarCatalogo(...argsContrato(a)));
  // Entradas inválidas.
  await assert.rejects(k.anclarCatalogo.staticCall(202613,a.csvSha256,a.ids,a.prioridades,a.slas),/Periodo invalido/);
  await assert.rejects(k.anclarCatalogo.staticCall(PERIODO_CATALOGO,a.csvSha256,a.ids,a.prioridades.slice(1),a.slas),/Lote invalido/);
  await assert.rejects(k.anclarCatalogo.staticCall(PERIODO_CATALOGO,a.csvSha256,[a.ids[0],a.ids[0]],[1,1],[4,4]),/Servicio duplicado/);
  await assert.rejects(k.anclarCatalogo.staticCall(PERIODO_CATALOGO,a.csvSha256,[a.ids[0]],[5],[4]),/Prioridad invalida/);
  // Anclaje: una transacción, 14 eventos ServicioAnclado y uno CatalogoAnclado.
  const rc=await (await k.anclarCatalogo(...argsContrato(a))).wait();assert.equal(rc.logs.length,15);
  const anclado=await leerAnclado(k);
  assert.equal(anclado.anclado,true);assert.equal(anclado.csvSha256,a.csvSha256);assert.equal(anclado.cantidad,14);
  assert.deepEqual(anclado.servicios,a.filas.map(f=>({id:f.id,prioridad:f.prioridad,sla:f.sla})));
  const s=await k.servicio(PERIODO_CATALOGO,encodeBytes32String('CS-11'));assert.deepEqual([Number(s.prioridad),Number(s.slaHoras),s.existe],[1,4,true]);
  // Segundo anclaje del mismo período: rechazado, con el mismo catálogo o con uno reclasificado.
  await assert.rejects(k.anclarCatalogo.staticCall(...argsContrato(a)),new RegExp(RECHAZO_RECLASIFICAR));
  const relajado=await argumentosAnclaje(reclasificar(CATALOGO));
  const bloque=await provider.getBlockNumber(),intento=await intentarReclasificar(k,relajado,municipio.address);
  assert.deepEqual(intento,{rechazado:true,motivo:RECHAZO_RECLASIFICAR});assert.equal(await provider.getBlockNumber(),bloque,'staticCall no gasta gas');
  await assert.rejects(k.anclarCatalogo(...argsContrato(relajado)));
  assert.deepEqual((await leerAnclado(k)).servicios,anclado.servicios,'lo anclado no cambió');
  // No hay ninguna función para modificar: solo anclarCatalogo escribe.
  assert.deepEqual(new Interface(ABI_CATALOGO).fragments.filter(f=>f.type==='function'&&!f.constant&&f.stateMutability!=='view').map(f=>f.name),['anclarCatalogo']);
  // Otro período sí se puede anclar (un catálogo por mes).
  await (await k.anclarCatalogo(202608,a.csvSha256,a.ids,a.prioridades,a.slas)).wait();
 }finally{await close();}
});

test('catálogo editado: ROJO con el servicio, lo anclado y lo editado, y TK-2026-04228 cambia de cumplimiento',async()=>{
 const {desplegar,close}=await setup();
 try {
  const {contract:k}=await desplegar(),a=await argumentosAnclaje(CATALOGO);await (await k.anclarCatalogo(...argsContrato(a))).wait();
  const anclado=await leerAnclado(k);
  assert.equal((await compararCatalogo(anclado,CATALOGO)).estado,'VERDE');
  // CS-11 (Intento de acceso no autorizado) relajado de CRITICA 4 h a ALTA 8 h.
  const editado=reclasificar(CATALOGO,'CS-11','ALTA',8),r=await compararCatalogo(anclado,editado);
  assert.equal(r.estado,'ROJO');
  assert.deepEqual(r.cambios,[{id:'CS-11',campo:'prioridad',anclado:'CRITICA',editado:'ALTA'},{id:'CS-11',campo:'sla_horas_habiles',anclado:4,editado:8}]);
  const t=ticketsAfectados(anclado,r.editado,TICKETS,BITACORA),x=t.find(e=>e.ticket==='TK-2026-04228');
  // Con la bitácora, TK-2026-04228 tardó 5,80 h: incumple las 4 h ancladas y cumpliría con 8 h.
  assert.ok(x);assert.equal(x.horas,5.8);assert.equal(x.horasDeBitacora,true);assert.equal(x.cumpleAnclado,false);assert.equal(x.cumpleEditado,true);
  assert.ok(t.every(e=>e.servicio==='CS-11'&&e.cumpleAnclado===false&&e.cumpleEditado===true));
  // Solo un cambio de nombre: ROJO, pero sin cambios de prioridad ni SLA.
  const nombre=await compararCatalogo(anclado,CATALOGO.replace('Acceso VPN','Acceso VPN institucional'));
  assert.equal(nombre.estado,'ROJO');assert.deepEqual(nombre.cambios,[]);assert.equal(nombre.otrosCampos,true);
  // Un servicio quitado se reporta.
  const quitado=await compararCatalogo(anclado,CATALOGO.split('\n').filter(l=>!l.startsWith('CS-14,')).join('\n'));
  assert.deepEqual(quitado.cambios,[{id:'CS-14',campo:'servicio',anclado:'presente',editado:'quitado'}]);
 }finally{await close();}
});

test('anclar con MetaMask: el servidor valida despliegue y anclaje por RPC y guarda el historial',async()=>{
 const {provider,municipio,otra,desplegar,dirs,close}=await setup();
 try {
  const a=await argumentosAnclaje(CATALOGO),anclar=async(k,args=a,signer=municipio)=>(await (await k.connect(signer).anclarCatalogo(...argsContrato(args))).wait()).hash;
  const ok=await desplegar(),tx=await anclar(ok.contract);
  const v=await validarCatalogo({provider,address:ok.address,deploymentTransaction:ok.deploymentTransaction,anclajeTransaction:tx,...local});
  assert.equal(v.owner,municipio.address);assert.equal(v.anclado.servicios.length,14);
  // Red equivocada, dirección sin código y otro contrato en la dirección.
  await assert.rejects(validarCatalogo({provider,address:ok.address,deploymentTransaction:ok.deploymentTransaction,anclajeTransaction:tx}),/Red equivocada/);
  await assert.rejects(validarCatalogo({provider,address:'0x000000000000000000000000000000000000dEaD',deploymentTransaction:ok.deploymentTransaction,anclajeTransaction:tx,...local}),/no tiene código/);
  const r=await loadRelojArtifact(),otro=await new ContractFactory(r.abi,r.bytecode,municipio).deploy([await sha('PV-01')],[otra.address],[3600],[100]);await otro.waitForDeployment();
  await assert.rejects(validarCatalogo({provider,address:await otro.getAddress(),deploymentTransaction:otro.deploymentTransaction().hash,anclajeTransaction:tx,...local}),/no coincide con RegistroCatalogo/);
  // Un catálogo anclado con otros valores (CS-11 relajado) no se acepta.
  const malo=await desplegar(),txMalo=await anclar(malo.contract,await argumentosAnclaje(reclasificar(CATALOGO)));
  await assert.rejects(validarCatalogo({provider,address:malo.address,deploymentTransaction:malo.deploymentTransaction,anclajeTransaction:txMalo,...local}),/no corresponde a datos\/catalogo_servicios.csv/);
  // Transacción de anclaje de otro contrato.
  await assert.rejects(validarCatalogo({provider,address:ok.address,deploymentTransaction:ok.deploymentTransaction,anclajeTransaction:txMalo,...local}),/no es un anclaje confirmado de este contrato/);
  await assert.rejects(validarCatalogo({provider,address:ok.address,deploymentTransaction:ok.deploymentTransaction,anclajeTransaction:tx,...local,admin:otra.address}),/Solo la cuenta del municipio/);
  assert.equal(await readCatalogoSepolia(dirs),null,'nada de lo rechazado se guardó');
  const c1=await registrarCatalogo({provider,address:ok.address,deploymentTransaction:ok.deploymentTransaction,anclajeTransaction:tx,publicRpc:'x',...local,dirs});
  assert.equal(c1.address,ok.address);assert.equal(c1.csvSha256,a.csvSha256);assert.equal(c1.servicios.length,14);assert.equal(c1.local,false);
  assert.equal(c1.links.anclaje,`https://sepolia.etherscan.io/tx/${tx}`);
  // Un catálogo nuevo archiva el anterior; el arranque también (nada se borra).
  const ok2=await desplegar(),tx2=await anclar(ok2.contract);
  const c2=await registrarCatalogo({provider,address:ok2.address,deploymentTransaction:ok2.deploymentTransaction,anclajeTransaction:tx2,publicRpc:'x',...local,dirs});
  assert.ok(c2.previous.startsWith('catalogo-sepolia-historial/'));
  assert.ok(await archivarCatalogo(dirs));assert.equal(await readCatalogoSepolia(dirs),null);
  assert.equal((await fs.readdir(path.join(dirs.evidenceDir,'catalogo-sepolia-historial'))).length,2);
 }finally{await close();}
});

test('catálogo precompilado: recompilar da el mismo bytecode, abi e input estándar; el ABI coincide',async()=>{
 const saved=await loadCatalogoArtifact(),fresh=await compileCatalogo();
 assert.equal(fresh.bytecode,saved.bytecode);assert.equal(fresh.deployedBytecode,saved.deployedBytecode);
 assert.deepEqual(fresh.abi,saved.abi);assert.deepEqual(fresh.input,saved.input);assert.equal(fresh.compiler,saved.compiler);
 assert.match(saved.compiler,/^0\.8\.30\+commit\./);assert.equal(saved.input.settings.evmVersion,'shanghai');assert.deepEqual(saved.input.settings.optimizer,{enabled:true,runs:200});
 const firmas=i=>i.fragments.map(f=>f.format('full')).sort();
 assert.deepEqual(firmas(new Interface(ABI_CATALOGO)),firmas(new Interface(saved.abi)));
});
