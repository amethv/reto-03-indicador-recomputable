// npm run proveedor · Portal del proveedor en http://127.0.0.1:8081
// Programa SEPARADO del municipio: solo sirve los archivos estáticos de esta carpeta. No tiene API,
// no guarda nada y no comparte estado con el servidor del municipio; la página lee Sepolia por RPC
// público y firma con la MetaMask del proveedor. En Render se publica la misma carpeta como sitio estático.
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const DIR = import.meta.dirname;
const MIME = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8'};

export async function startPortal({port = Number(process.env.PORTAL_PORT) || 8081, host = process.env.HOST || '127.0.0.1'} = {}) {
 const server = http.createServer(async (req, res) => {
  try {
   if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
   const url = new URL(req.url, 'http://127.0.0.1');
   const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).slice(1);
   const file = path.resolve(DIR, rel);
   // Solo archivos de esta carpeta, y nunca este servidor.
   if (!file.startsWith(DIR + path.sep) || path.basename(file) === 'servidor.mjs' || !MIME[path.extname(file)]) { res.writeHead(404); res.end('No disponible'); return; }
   const data = await fs.readFile(file);
   res.writeHead(200, {'Content-Type': MIME[path.extname(file)], 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
   res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) { res.writeHead(e.code === 'ENOENT' ? 404 : 400, {'Content-Type': 'text/plain; charset=utf-8'}); res.end('No disponible'); }
 });
 await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
 return {url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}/`, close: () => new Promise(r => server.close(r))};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
 const portal = await startPortal();
 console.log(`Portal del proveedor: ${portal.url}`);
 console.log('Ábrelo en el navegador del proveedor, con SU MetaMask, usando el enlace que envía el municipio (incluye ?contrato=0x…).');
 for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await portal.close(); process.exit(0); });
}
