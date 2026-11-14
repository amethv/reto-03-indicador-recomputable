// Cada arranque del servidor empieza sin período activo de Sepolia ni reloj del proveedor.
// Lo anterior pasa al historial; nada se borra (ni sales, ni historial previo).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {iniciarSinPeriodo} from '../scripts/arranque.mjs';
import {readSepoliaConfig} from '../scripts/sepolia-web.mjs';
import {readRelojSepolia} from '../scripts/reloj-sepolia.mjs';
import {readCatalogoSepolia} from '../scripts/catalogo-sepolia.mjs';

test('arranque: archiva el período y el reloj activos, sin borrar sales ni historial',async()=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'arranque-')),ev=path.join(base,'evidencias'),sec=path.join(base,'.secreto');
 const dirs={evidenceDir:ev,secretDir:sec},relojDirs={evidenceDir:ev},catalogoDirs={evidenceDir:ev};
 try {
  const periodo={address:'0x523fEE802aB41BE59EbD872e3b57E9799C8fE48d',sealTransaction:'0x01'},reloj={address:'0x0000000000000000000000000000000000000abc'};
  await fs.mkdir(path.join(ev,'sepolia-historial','anterior'),{recursive:true});await fs.mkdir(sec,{recursive:true});
  await fs.writeFile(path.join(ev,'red-sepolia.json'),JSON.stringify(periodo));
  await fs.writeFile(path.join(ev,'sello-sepolia.json'),'{"evidencia":true}');
  await fs.writeFile(path.join(ev,'reloj-sepolia.json'),JSON.stringify(reloj));
  await fs.writeFile(path.join(ev,'catalogo-sepolia.json'),JSON.stringify({address:'0x0000000000000000000000000000000000000cab'}));
  await fs.writeFile(path.join(sec,'sal-sepolia-0x523f.json'),'{"salt":"secreta"}');
  const r=await iniciarSinPeriodo({dirs,relojDirs,catalogoDirs});
  // El catálogo anclado del Nivel 3 también pasa al historial.
  assert.equal(await readCatalogoSepolia(catalogoDirs),null);assert.ok(r.catalogo.includes(path.join('evidencias','catalogo-sepolia-historial')));
  // Sin período ni reloj activos: la vista Sellar dirá «Sin período activo» y el reloj empezará en «Preparar reloj».
  assert.equal(await readSepoliaConfig(dirs),null);assert.equal(await readRelojSepolia(relojDirs),null);
  // Todo quedó en el historial, con su contenido intacto.
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(r.periodo,'red-sepolia.json'),'utf8')),periodo);
  assert.equal(await fs.readFile(path.join(r.periodo,'sello-sepolia.json'),'utf8'),'{"evidencia":true}');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(r.reloj,'reloj-sepolia.json'),'utf8')),reloj);
  assert.ok(r.periodo.includes(path.join('evidencias','sepolia-historial')));assert.ok(r.reloj.includes(path.join('evidencias','reloj-sepolia-historial')));
  // Nada se borra: la sal y la entrada previa del historial siguen ahí.
  assert.equal(await fs.readFile(path.join(sec,'sal-sepolia-0x523f.json'),'utf8'),'{"salt":"secreta"}');
  assert.equal((await fs.readdir(path.join(ev,'sepolia-historial'))).length,2);
  // Un segundo arranque sin nada activo no hace nada.
  assert.deepEqual(await iniciarSinPeriodo({dirs,relojDirs,catalogoDirs}),{periodo:null,reloj:null,catalogo:null});
 }finally{await fs.rm(base,{recursive:true,force:true});}
});
