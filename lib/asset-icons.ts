import logoCatalog from "../data/asset-logo-sources.json" with {type:"json"};

const tickerSuffixes:Array<[string,string]>=[
  [".PL",".WA"],[".UK",".L"],[".DK",".CO"],[".NL",".AS"],
  [".FR",".PA"],[".ES",".MC"],[".IT",".MI"],[".CH",".SW"],
  [".SE",".ST"],[".NO",".OL"],[".DE",".DE"],
];

export function logoTicker(input:string){
  const symbol=input.trim().toUpperCase();
  if(symbol.endsWith(".US"))return symbol.slice(0,-3).replace(".","-");
  for(const [source,target] of tickerSuffixes)if(symbol.endsWith(source))return`${symbol.slice(0,-source.length)}${target}`;
  return symbol;
}

export function assetLogoSource(symbol:string,assetClass:string,image?:string){
  if(image){
    try{
      const url=new URL(image);
      if(url.protocol==="https:"&&(url.hostname==="coin-images.coingecko.com"||url.hostname==="assets.coingecko.com"))return url.toString();
    }catch{}
  }
  if(/got|cash|inne/i.test(assetClass))return null;
  const normalized=symbol.trim().toUpperCase();
  if(!normalized||/krypto|crypto|stable/i.test(assetClass))return null;
  return`https://financialmodelingprep.com/image-stock/${encodeURIComponent(logoTicker(normalized))}.png`;
}

export function assetLogoSources(symbol:string,assetClass:string,image?:string){
  const primary=assetLogoSource(symbol,assetClass,image);
  if(!primary)return[];
  return primary?[primary]:[];
}

const localLogos=new Map<string,string>();
for(const entry of logoCatalog){
  localLogos.set(entry.symbol.toUpperCase(),entry.file);
  for(const alias of entry.aliases||[])localLogos.set(alias.toUpperCase(),entry.file);
}

export function localAssetLogoPath(symbol:string){
  const file=localLogos.get(symbol.trim().toUpperCase());
  return file?`/asset-logos/${file}`:null;
}

function escapeXml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]!))}

export function assetInitials(symbol:string){
  const cleaned=symbol.trim().toUpperCase().replace(/\.(PL|WA|US|UK|L)$/i,"").replace(/[^A-Z0-9]/g,"");
  return(cleaned||"?").slice(0,2);
}

export function fallbackAssetSvg(symbol:string,assetClass:string){
  const initials=escapeXml(assetInitials(symbol));
  const palette=/krypto|crypto|stable/i.test(assetClass)?["#e7f6ef","#18794e"]:/got|cash/i.test(assetClass)?["#fff4cc","#765b00"]:["#eef2ff","#4338ca"];
  return`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${palette[0]}"/><text x="48" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="${palette[1]}">${initials}</text></svg>`;
}
