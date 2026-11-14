// Arranque del servidor (npm start, en el equipo o en Render): la app empieza SIN período activo
// de Sepolia, para que julio se selle en vivo. El período anterior (configuración y evidencia) pasa a
// evidencias/sepolia-historial/ y el reloj del proveedor a evidencias/reloj-sepolia-historial/.
// Nada se borra: las sales siguen en .secreto/, una por contrato. Mientras el servidor sigue
// encendido, lo que se prepare en la sesión se conserva aunque se recargue la página.
import {DIRS,archivarPeriodo} from './sepolia-web.mjs';
import {RELOJ_DIRS,archivarReloj} from './reloj-sepolia.mjs';
import {CATALOGO_DIRS,archivarCatalogo} from './catalogo-sepolia.mjs';

// El catálogo anclado (Nivel 3) también pasa a evidencias/catalogo-sepolia-historial/.
export async function iniciarSinPeriodo({dirs=DIRS,relojDirs=RELOJ_DIRS,catalogoDirs=CATALOGO_DIRS}={}){
 return {periodo:await archivarPeriodo(dirs),reloj:await archivarReloj(relojDirs),catalogo:await archivarCatalogo(catalogoDirs)};
}
