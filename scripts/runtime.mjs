import fs from 'node:fs/promises';
import path from 'node:path';
import solc from 'solc';
import {ContractFactory,JsonRpcProvider,keccak256} from 'ethers';
import {POLICY,sha,validSalt,saltCommitment} from '../src/core.mjs';
export const ROOT=path.resolve(import.meta.dirname,'..');
// nivel1-v4: el sello v3 anterior es inmutable y usaba el manifiesto sin sal.
export const INSTANCE=process.env.ATENEA_INSTANCE||'nivel1-v4';
if(!/^[a-zA-Z0-9_-]{1,80}$/.test(INSTANCE))throw new Error('Nombre de instancia inválido');
export const STATE_ROOT=path.join(ROOT,'.instances',INSTANCE);
export const EVIDENCE_DIR=path.join(STATE_ROOT,'evidencias');
// La sal secreta del sello nunca va en evidencias/: la auditoría copia esa carpeta al repositorio.
export const SALT_FILES=Object.freeze({local:path.join(STATE_ROOT,'secreto','sal-202607.json'),sepolia:path.join(ROOT,'.secreto','sal-sepolia-202607.json')});
/** Guarda la sal una sola vez (flag wx). Si ya existe la misma sal no hace nada; si es otra, falla. */
export async function writeSalt(file,salt){
 if(!validSalt(salt))throw new Error('Sal inválida');
 const data={period:202607,salt,saltCommitment:await saltCommitment(salt),aviso:'Secreto: no publicar. Sin esta sal no se pueden comprobar los tickets del sello.'};
 await fs.mkdir(path.dirname(file),{recursive:true});
 try{await fs.writeFile(file,JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});}
 catch(e){if(e.code!=='EEXIST')throw e;if(await readSalt(file)!==salt)throw new Error('Ya existe otra sal para este período; no se reemplaza');}
}
/** Devuelve la sal guardada, o null si el archivo no existe. */
export async function readSalt(file){
 let data;try{data=JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!validSalt(data.salt))throw new Error(`Sal con formato inválido en ${file}`);
 return data.salt;
}
export async function compile({write=true}={}){
 const source=await fs.readFile(path.join(ROOT,'contracts/RegistroIndicador.sol'),'utf8');
 const input={language:'Solidity',sources:{'RegistroIndicador.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifact=output.contracts['RegistroIndicador.sol'].RegistroIndicador;
 const result={abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,source,compiler:solc.version()};
 if(write){await fs.mkdir(EVIDENCE_DIR,{recursive:true});await fs.writeFile(path.join(EVIDENCE_DIR,'contrato.json'),JSON.stringify(result,null,2));}return {...result,input};
}
export async function deploy(provider){
 const artifact=await compile();const signer=await provider.getSigner(0),rulesHash=await sha(JSON.stringify(POLICY));
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(rulesHash);await contract.waitForDeployment();
 const receipt=await contract.deploymentTransaction().wait();if(receipt.status!==1)throw new Error('Falló despliegue');
 const address=await contract.getAddress(),code=await provider.getCode(address);
 return {address,chainId:Number((await provider.getNetwork()).chainId),network:'EVM local Ganache (red de desarrollo real)',deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,codeHash:keccak256(code),rulesHash,rpc:'http://127.0.0.1:8545',local:true};
}
export function providerFor(url){const p=new JsonRpcProvider(url,undefined,{cacheTimeout:-1});p.pollingInterval=100;return p;}
