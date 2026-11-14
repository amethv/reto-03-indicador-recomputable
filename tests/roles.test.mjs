// Reloj del proveedor por roles: cada parte firma en su turno y lo que va fuera de turno se explica, no falla.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory} from 'ethers';
import {loadRelojArtifact} from '../scripts/reloj.mjs';
import {parseProveedores,parseCasos,constructorArgs,abrirCasos,responderCasos,recalcularComoTercero} from '../src/reloj.mjs';

const read=f=>fs.readFile(new URL(`../datos/${f}`,import.meta.url),'utf8');
const PROVEEDORES=parseProveedores(await read('proveedores.csv')),CASOS=parseCasos(await read('tickets_proveedor.csv'));

test('roles: fuera de turno se explica; luego municipio, proveedor 1 y auditor en orden',async()=>{
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 try {
  const artifact=await loadRelojArtifact(),[municipio,pv01,pv02]=await Promise.all([0,1,2].map(i=>provider.getSigner(i)));
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,municipio).deploy(...constructorArgs(PROVEEDORES,[pv01.address,pv02.address]));await contract.waitForDeployment();
  const address=await contract.getAddress(),desde=(await contract.deploymentTransaction().wait()).blockNumber;
  const signerFor=async id=>({'PV-01':pv01,'PV-02':pv02})[id];
  // El proveedor antes de la apertura: nada se envía y cada caso trae el motivo del contrato.
  const antes=await provider.getBlockNumber(),fuera=await responderCasos(contract,signerFor,CASOS);
  assert.ok(fuera.every(r=>r.estado==='SIN_APERTURA'&&r.motivo==='Caso no abierto'));assert.equal(await provider.getBlockNumber(),antes);
  // El municipio abre los 9; una segunda firma no envía nada y explica «Caso ya abierto».
  const pasos=[];const a=await abrirCasos(contract,municipio,CASOS,p=>pasos.push(p));
  assert.deepEqual([a.abiertos,a.yaAbiertos],[9,0]);assert.ok(pasos.every(p=>p.cuenta===municipio.address));
  const b=await abrirCasos(contract,municipio,CASOS);assert.deepEqual([b.abiertos,b.yaAbiertos,b.motivo],[0,9,'Caso ya abierto']);
  // El proveedor 1 responde: 8 aceptados y PVT-04226 rechazado; una segunda vez no repite nada.
  const r=await responderCasos(contract,signerFor,CASOS);
  assert.equal(r.filter(x=>x.estado==='ACEPTADO').length,8);
  assert.deepEqual(r.filter(x=>x.estado==='RECHAZADO').map(x=>[x.id,x.motivo]),[['PVT-04226','Respuesta anterior a la apertura']]);
  assert.ok(r.filter(x=>x.estado==='ACEPTADO').every(x=>x.cuenta===pv01.address));
  const r2=await responderCasos(contract,signerFor,CASOS);
  assert.equal(r2.filter(x=>x.estado==='YA_RESPONDIDO').length,8);assert.equal(r2.filter(x=>x.estado==='RECHAZADO').length,1);
  // El auditor, sin llaves, recalcula 2.592 USD y coincide con el contrato.
  const t=await recalcularComoTercero(new BrowserProvider(engine,undefined,{cacheTimeout:-1}),address,desde);
  assert.equal(t.total,259200n);assert.equal(t.coincide,true);
 }finally{provider.destroy();await engine.disconnect();}
});
