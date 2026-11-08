import {test} from 'node:test';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {BrowserProvider,ContractFactory,Contract,keccak256} from 'ethers';
import {compile} from '../scripts/runtime.mjs';
import {POLICY,sha} from '../src/core.mjs';
import {ABI,readAnchor} from '../src/chain.mjs';
test('contrato EVM real: propietario, 187, inmutabilidad, recibo y privacidad de calldata',async()=>{
 const engine=ganache.provider({wallet:{deterministic:true},chain:{chainId:31337,hardfork:'shanghai'},logging:{quiet:true}});
 const provider=new BrowserProvider(engine,undefined,{cacheTimeout:-1});provider.pollingInterval=50;
 try {
  const artifact=await compile(),signer=await provider.getSigner(0),contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(await sha(JSON.stringify(POLICY)));await contract.waitForDeployment();
  const deployed=await contract.deploymentTransaction().wait(),address=await contract.getAddress();
  const config={chainId:31337,address,codeHash:keccak256(await provider.getCode(address)),deploymentBlock:deployed.blockNumber};
  await assert.rejects(readAnchor(provider,config),/No existe sello/);
  const root=await sha('raiz de prueba unitaria'),evidence=await sha('evidencia de prueba unitaria');
  await assert.rejects(contract.seal(202607,root,evidence,186));
  await assert.rejects(contract.seal(202608,root,evidence,187));
  const other=contract.connect(await provider.getSigner(1));await assert.rejects(other.seal(202607,root,evidence,187));
  const tx=await contract.seal(202607,root,evidence,187);assert.equal((await tx.wait()).status,1);
  const anchor=await readAnchor(provider,config);assert.equal(anchor.root,root);assert.equal(anchor.evidenceHash,evidence);assert.equal(anchor.count,187);assert.equal(anchor.calldata.length,2+(4+4*32)*2);
  await assert.rejects(contract.seal(202607,root,evidence,187));assert.equal((await readAnchor(provider,config)).transactionHash,tx.hash);
  const functions=artifact.abi.filter(x=>x.type==='function').map(x=>x.name).sort();assert.deepEqual(functions,['getSeal','owner','rulesHash','seal']);
  await assert.rejects(readAnchor(provider,{...config,chainId:11155111}),/Red distinta/);
  await assert.rejects(readAnchor(provider,{...config,codeHash:root}),/Bytecode distinto/);
 }finally{provider.destroy();await engine.disconnect();}
});