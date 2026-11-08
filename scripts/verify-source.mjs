import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');
export async function verifySource(sourceDirectory=path.join(root,'datos')) {
 const manifest=JSON.parse(await fs.readFile(path.join(root,'src/source-manifest.json'),'utf8'));
 const rows=[];
 for(const [name,expected] of Object.entries(manifest.files)){
  const actual=createHash('sha256').update(await fs.readFile(path.join(sourceDirectory,name))).digest('hex');
  rows.push({file:name,ok:actual===expected,expected,actual});
 }
 if(rows.some(r=>!r.ok))throw new Error('Procedencia fallida: '+rows.filter(r=>!r.ok).map(r=>r.file).join(', '));
 return rows;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const rows=await verifySource(process.argv[2]);
 console.log(JSON.stringify({source:process.argv[2]||'datos/',count:rows.length,allMatch:true,files:rows},null,2));
}
