import { assetLogoSources, fallbackAssetSvg } from "../../../lib/asset-icons";

const iconCache=new Map<string,{expires:number;body:ArrayBuffer;contentType:string}>();
const CACHE_MS=7*24*60*60_000;

function svgResponse(symbol:string,assetClass:string){
  return new Response(fallbackAssetSvg(symbol,assetClass),{headers:{"content-type":"image/svg+xml; charset=utf-8","cache-control":"public, max-age=86400"}});
}

export async function GET(request:Request){
  const url=new URL(request.url);
  const symbol=(url.searchParams.get("symbol")||"").trim().toUpperCase().slice(0,32);
  const assetClass=(url.searchParams.get("assetClass")||"Inne").trim().slice(0,32);
  const image=(url.searchParams.get("image")||"").trim().slice(0,500);
  if(!symbol)return svgResponse("?",assetClass);
  const sources=assetLogoSources(symbol,assetClass,image);
  for(const source of sources){
    const saved=iconCache.get(source);
    if(saved&&saved.expires>Date.now())return new Response(saved.body.slice(0),{headers:{"content-type":saved.contentType,"cache-control":"public, max-age=604800, immutable"}});
    try{
      const response=await fetch(source,{headers:{accept:"image/avif,image/webp,image/svg+xml,image/*","user-agent":"LekkiPortfel/1.0"},signal:AbortSignal.timeout(5000)});
      const contentType=response.headers.get("content-type")||"";
      if(!response.ok||!contentType.startsWith("image/"))continue;
      const body=await response.arrayBuffer();
      if(!body.byteLength||body.byteLength>1_000_000)continue;
      iconCache.set(source,{expires:Date.now()+CACHE_MS,body,contentType});
      return new Response(body.slice(0),{headers:{"content-type":contentType,"cache-control":"public, max-age=604800, immutable"}});
    }catch{}
  }
  return svgResponse(symbol,assetClass);
}
