import fs from 'node:fs/promises';
import path from 'node:path';
import {ContractFactory,JsonRpcProvider,keccak256} from 'ethers';
import {POLICY,sha,validSalt,saltCommitment} from '../src/core.mjs';
export const ROOT=path.resolve(import.meta.dirname,'..');
// nivel2-v1: instancia por defecto desde el Nivel 2 (contrato del Nivel 1 + RelojProveedor).
// nivel1-v4 queda intacta con su sello del Nivel 1; se abre con ATENEA_INSTANCE=nivel1-v4.
export const INSTANCE=process.env.ATENEA_INSTANCE||'nivel2-v1';
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
export const SOURCE_PATH=path.join(ROOT,'contracts','RegistroIndicador.sol');
export const ARTIFACT_PATH=path.join(ROOT,'contracts','RegistroIndicador.json');
/** Compila con solc (solo desarrollo: npm run compile y las pruebas). */
export async function compile(){
 const {default:solc}=await import('solc');
 const source=await fs.readFile(SOURCE_PATH,'utf8');
 const input={language:'Solidity',sources:{'RegistroIndicador.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'shanghai',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
 const output=JSON.parse(solc.compile(JSON.stringify(input)));
 const errors=(output.errors||[]).filter(e=>e.severity==='error');if(errors.length)throw new Error(errors.map(e=>e.formattedMessage).join('\n'));
 const artifact=output.contracts['RegistroIndicador.sol'].RegistroIndicador;
 return {contractName:'RegistroIndicador',compiler:solc.version(),abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,deployedBytecode:'0x'+artifact.evm.deployedBytecode.object,input};
}
/** Lee el contrato precompilado (contracts/RegistroIndicador.json) y comprueba que corresponda al .sol actual. */
export async function loadArtifact(){
 let artifact;try{artifact=JSON.parse(await fs.readFile(ARTIFACT_PATH,'utf8'));}catch(e){if(e.code==='ENOENT')throw new Error('Falta contracts/RegistroIndicador.json. Ejecuta npm run compile.');throw e;}
 if(artifact.input?.sources?.['RegistroIndicador.sol']?.content!==await fs.readFile(SOURCE_PATH,'utf8'))throw new Error('contracts/RegistroIndicador.json no corresponde al .sol actual. Ejecuta npm run compile.');
 return artifact;
}
export async function deploy(provider){
 const artifact=await loadArtifact();const signer=await provider.getSigner(0),rulesHash=await sha(JSON.stringify(POLICY));
 // Copia del contrato desplegado para la auditoría (abi, bytecode, fuente y compilador).
 await fs.mkdir(EVIDENCE_DIR,{recursive:true});
 await fs.writeFile(path.join(EVIDENCE_DIR,'contrato.json'),JSON.stringify({abi:artifact.abi,bytecode:artifact.bytecode,source:artifact.input.sources['RegistroIndicador.sol'].content,compiler:artifact.compiler},null,2));
 const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(rulesHash);await contract.waitForDeployment();
 const receipt=await contract.deploymentTransaction().wait();if(receipt.status!==1)throw new Error('Falló despliegue');
 const address=await contract.getAddress(),code=await provider.getCode(address);
 return {address,chainId:Number((await provider.getNetwork()).chainId),network:'EVM local Ganache (red de desarrollo real)',deploymentBlock:receipt.blockNumber,deploymentTransaction:receipt.hash,codeHash:keccak256(code),rulesHash,rpc:'http://127.0.0.1:8545',local:true};
}
export function providerFor(url){const p=new JsonRpcProvider(url,undefined,{cacheTimeout:-1});p.pollingInterval=100;return p;}
