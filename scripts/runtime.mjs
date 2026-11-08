import fs from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import {ContractFactory,JsonRpcProvider,keccak256} from 'ethers';
import {POLICY,sha} from '../src/core.mjs';
export const ROOT=path.resolve(import.meta.dirname,'..');
export const INSTANCE=process.env.ATENEA_INSTANCE||'nivel1-v3';
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(INSTANCE))throw new Error('Nombre de instancia inválido');
export const STATE_ROOT=path.join(ROOT,'.instances',INSTANCE);
export const EVIDENCE_DIR=path.join(STATE_ROOT,'evidencias');
export async function compile(){
 const source=await fs.readFile(path.join(ROOT,'contracts/RegistroJulio.sol'),'utf8');
 const input={language:'Solidity',sources:{'RegistroJulio.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifact=output.contracts['RegistroJulio.sol'].RegistroJulio;
 const result={abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,source,compiler:solc.version()};
 await fs.mkdir(EVIDENCE_DIR,{recursive:true});await fs.writeFile(path.join(EVIDENCE_DIR,'contrato.json'),JSON.stringify(result,null,2));return result;
}
export async function deploy(provider){
 const artifact=await compile();const signer=await provider.getSigner(0),rulesHash=await sha(JSON.stringify(POLICY));
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(rulesHash);await contract.waitForDeployment();
 const receipt=await contract.deploymentTransaction().wait();if(receipt.status!==1)throw new Error('Falló despliegue');
 const address=await contract.getAddress(),code=await provider.getCode(address);
 return {address,chainId:Number((await provider.getNetwork()).chainId),network:'EVM local Ganache (red de desarrollo real)',deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,codeHash:keccak256(code),rulesHash,rpc:'http://127.0.0.1:8545',local:true};
}
export function providerFor(url){const p=new JsonRpcProvider(url,undefined,{cacheTimeout:-1});p.pollingInterval=100;return p;}
