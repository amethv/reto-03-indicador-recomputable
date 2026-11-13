// MetaMask para Sepolia (Nivel 1). La llave nunca sale de la billetera: aquí solo se pide firmar.
import {BrowserProvider} from 'ethers';

export const SEPOLIA_ID=11155111,SEPOLIA_HEX='0xaa36a7';
class WalletError extends Error{}

/** Conecta MetaMask y la deja en Sepolia. onStatus muestra en pantalla lo que se está pidiendo. */
export async function conectarSepolia(onStatus=()=>{}){
 const eth=globalThis.ethereum;
 if(!eth)throw new WalletError('No se encontró MetaMask en este navegador. Instala la extensión MetaMask, importa o crea la cuenta del municipio y recarga la página.');
 onStatus('Conectando con MetaMask…');
 await eth.request({method:'eth_requestAccounts'});
 if(await eth.request({method:'eth_chainId'})!==SEPOLIA_HEX){
  onStatus('MetaMask está en otra red: acepta el cambio a Sepolia.');
  try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:SEPOLIA_HEX}]});}
  catch(e){
   if(e?.code===4902){await eth.request({method:'wallet_addEthereumChain',params:[{chainId:SEPOLIA_HEX,chainName:'Sepolia',nativeCurrency:{name:'Sepolia ETH',symbol:'ETH',decimals:18},rpcUrls:['https://ethereum-sepolia-rpc.publicnode.com'],blockExplorerUrls:['https://sepolia.etherscan.io']}]});}
   else throw new WalletError(e?.code===4001?'Cambio de red cancelado: MetaMask debe estar en Sepolia para firmar.':`No se pudo cambiar MetaMask a Sepolia: ${e?.message??e}`);
  }
 }
 const provider=new BrowserProvider(eth,'any');
 if(Number((await provider.getNetwork()).chainId)!==SEPOLIA_ID)throw new WalletError('MetaMask no quedó en Sepolia. Cámbiala a Sepolia y vuelve a intentarlo.');
 const signer=await provider.getSigner();
 return {provider,signer,address:await signer.getAddress()};
}

/** Mensaje claro para errores de la billetera. */
export function mensajeBilletera(e){
 if(e instanceof WalletError)return e.message;
 if(e?.code==='ACTION_REJECTED'||e?.code===4001||e?.info?.error?.code===4001)return 'Firma cancelada en MetaMask: no se envió nada.';
 if(/insufficient funds/i.test(e?.message??''))return 'La cuenta no tiene Sepolia ETH suficiente para pagar la transacción. Pide ETH de prueba en un faucet.';
 return e?.shortMessage??e?.message??String(e);
}
