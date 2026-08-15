import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const catalogPath=resolve(projectRoot,"data","asset-logo-sources.json");
const outputDir=resolve(projectRoot,"public","asset-logos");
const checkOnly=process.argv.includes("--check");
const entries=JSON.parse(await readFile(catalogPath,"utf8"));

await mkdir(outputDir,{recursive:true});

function digest(value){return createHash("sha256").update(value).digest("hex").slice(0,12)}

async function existingFile(path){
  try{const info=await stat(path);return info.isFile()&&info.size>0}catch{return false}
}

if(checkOnly){
  const missing=[];
  for(const entry of entries)if(!await existingFile(resolve(outputDir,entry.file)))missing.push(entry.symbol);
  if(missing.length){console.error(`Brak lokalnych logo: ${missing.join(", ")}`);process.exitCode=1}
  else console.log(`Katalog logo kompletny: ${entries.length} plików.`);
}else{
  let changed=0;
  let unchanged=0;
  const failures=[];
  for(const entry of entries){
    if(!entry.source){
      if(await existingFile(resolve(outputDir,entry.file)))unchanged++;
      else failures.push(`${entry.symbol}: brak pliku zarządzanego lokalnie`);
      continue;
    }
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),15_000);
    try{
      const response=await fetch(entry.source,{headers:{accept:"image/avif,image/webp,image/svg+xml,image/*","user-agent":"LekkiPortfel logo sync/1.0"},signal:controller.signal});
      const contentType=response.headers.get("content-type")||"";
      if(!response.ok||(!contentType.startsWith("image/")&&!entry.file.endsWith(".svg")))throw new Error(`HTTP ${response.status}, ${contentType||"bez content-type"}`);
      const body=Buffer.from(await response.arrayBuffer());
      if(!body.length||body.length>1_000_000)throw new Error(`nieprawidłowy rozmiar ${body.length} B`);
      const target=resolve(outputDir,entry.file);
      const current=await existingFile(target)?await readFile(target):null;
      if(current&&digest(current)===digest(body)){unchanged++;continue}
      const temporary=`${target}.tmp`;
      await writeFile(temporary,body);
      await unlink(target).catch(()=>{});
      await rename(temporary,target);
      changed++;
      console.log(`${entry.symbol}: zapisano ${entry.file} (${body.length} B)`);
    }catch(error){failures.push(`${entry.symbol}: ${error instanceof Error?error.message:String(error)}`)}
    finally{clearTimeout(timer)}
  }
  console.log(`Synchronizacja zakończona: ${changed} zmienionych, ${unchanged} bez zmian.`);
  if(failures.length){console.error(failures.join("\n"));process.exitCode=1}
}
