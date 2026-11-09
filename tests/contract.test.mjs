import {test} from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,keccak256} from 'ethers';
import {compile,loadArtifact} from '../scripts/runtime.mjs';
import {POLICY,sha} from '../src/core.mjs';
import {readAnchor} from '../src/chain.mjs';

async function setup(){
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 const artifact=await loadArtifact(),signer=await provider.getSigner(0);
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(await sha(JSON.stringify(POLICY)));await contract.waitForDeployment();
 const deployed=await contract.deploymentTransaction().wait(),address=await contract.getAddress();
 const config={chainId:31337,address,codeHash:keccak256(await provider.getCode(address)),deploymentBlock:deployed.blockNumber};
 return {engine,provider,artifact,contract,config,close:async()=>{provider.destroy();await engine.disconnect();}};
}
// El motivo del revert se lee con staticCall; además se comprueba que la transacción real falla.
async function reverts(contract,args,reason){await assert.rejects(contract.seal.staticCall(...args),reason);await assert.rejects(contract.seal(...args));}
const root=await sha('raiz de prueba unitaria'),evidence=await sha('evidencia de prueba unitaria'),zero='0x'+'00'.repeat(32);

test('contrato: solo el sellador, compromisos no vacíos, recibo y privacidad de calldata',async()=>{
 const {provider,artifact,contract,config,close}=await setup();
 try {
  await assert.rejects(readAnchor(provider,config),/No existe sello/);
  await reverts(contract.connect(await provider.getSigner(1)),[202607,root,evidence,187],/Solo sellador/);
  await reverts(contract,[202607,zero,evidence,187],/Compromiso vacio/);
  await reverts(contract,[202607,root,zero,187],/Compromiso vacio/);
  const tx=await contract.seal(202607,root,evidence,187);assert.equal((await tx.wait()).status,1);
  const anchor=await readAnchor(provider,config);assert.equal(anchor.root,root);assert.equal(anchor.evidenceHash,evidence);assert.equal(anchor.count,187);assert.equal(anchor.calldata.length,2+(4+4*32)*2);
  assert.deepEqual(artifact.abi.filter(x=>x.type==='function').map(x=>x.name).sort(),['getSeal','owner','rulesHash','seal']);
  await assert.rejects(readAnchor(provider,{...config,chainId:11155111}),/Red distinta/);
  await assert.rejects(readAnchor(provider,{...config,codeHash:root}),/Bytecode distinto/);
 }finally{await close();}
});

test('contrato generalizado: acepta cualquier AAAAMM válido y count > 0; rechaza lo demás',async()=>{
 const {contract,close}=await setup();
 try {
  for(const period of [202600,202613,199912,1000001,0])await reverts(contract,[period,root,evidence,10],/Periodo AAAAMM invalido/);
  await reverts(contract,[202609,root,evidence,0],/Cantidad vacia/);
  assert.equal((await (await contract.seal(200001,root,evidence,1)).wait()).status,1);
  assert.equal((await (await contract.seal(999912,root,evidence,4294967295)).wait()).status,1);
 }finally{await close();}
});

test('contrato: sella dos períodos distintos y cada uno conserva su compromiso',async()=>{
 const {provider,contract,config,close}=await setup();
 try {
  const rootAug=await sha('raiz agosto'),evAug=await sha('evidencia agosto');
  await (await contract.seal(202607,root,evidence,187)).wait();
  await (await contract.seal(202608,rootAug,evAug,203)).wait();
  const july=await contract.getSeal(202607),august=await contract.getSeal(202608);
  assert.deepEqual([july.root,july.evidenceHash,Number(july.count)],[root,evidence,187]);
  assert.deepEqual([august.root,august.evidenceHash,Number(august.count)],[rootAug,evAug,203]);
  const logs=await contract.queryFilter(contract.filters.Sealed(),config.deploymentBlock,'latest');
  assert.deepEqual(logs.map(l=>Number(l.args.period)),[202607,202608]);
  assert.equal((await readAnchor(provider,config)).root,root,'el verificador de julio sigue leyendo solo julio');
 }finally{await close();}
});

test('contrato: un período ya sellado no se puede resellar, ni con otros valores',async()=>{
 const {provider,contract,config,close}=await setup();
 try {
  const tx=await contract.seal(202607,root,evidence,187);await tx.wait();
  await reverts(contract,[202607,root,evidence,187],/Sello original inmutable/);
  await reverts(contract,[202607,await sha('otra raiz'),await sha('otra evidencia'),188],/Sello original inmutable/);
  const anchor=await readAnchor(provider,config);
  assert.equal(anchor.transactionHash,tx.hash);assert.equal(anchor.root,root);
 }finally{await close();}
});

test('verificador: exige 187 tickets para julio aunque el contrato acepte otra cantidad',async()=>{
 const {provider,contract,config,close}=await setup();
 try {
  await (await contract.seal(202607,root,evidence,186)).wait();
  await assert.rejects(readAnchor(provider,config),/187/);
 }finally{await close();}
});
test('contrato precompilado: recompilar da el mismo bytecode, abi e input estándar',async()=>{
 const saved=await loadArtifact(),fresh=await compile();
 assert.equal(fresh.bytecode,saved.bytecode);assert.equal(fresh.deployedBytecode,saved.deployedBytecode);
 assert.deepEqual(fresh.abi,saved.abi);assert.deepEqual(fresh.input,saved.input);assert.equal(fresh.compiler,saved.compiler);
 assert.match(saved.compiler,/^0\.8\.30\+commit\./);assert.equal(saved.input.settings.evmVersion,'shanghai');
});
