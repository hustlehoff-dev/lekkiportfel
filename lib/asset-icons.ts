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
  if(!normalized)return null;
  const kind=/krypto|crypto/i.test(assetClass)?"crypto":"ticker";
  const identifier=kind==="crypto"?normalized:logoTicker(normalized);
  return`https://img.loadlogo.com/${kind}/${encodeURIComponent(identifier)}?size=96&format=webp&fit=contain&fallback=404`;
}

export function assetLogoSources(symbol:string,assetClass:string,image?:string){
  const primary=assetLogoSource(symbol,assetClass,image);
  if(!primary)return[];
  if(image&&primary!==assetLogoSource(symbol,assetClass))return[primary];
  if(/krypto|crypto/i.test(assetClass))return[primary];
  return[primary,`https://financialmodelingprep.com/image-stock/${encodeURIComponent(logoTicker(symbol))}.png`];
}

function escapeXml(value:string){return value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[char]!))}

export function assetInitials(symbol:string){
  const cleaned=symbol.trim().toUpperCase().replace(/\.(PL|WA|US|UK|L)$/i,"").replace(/[^A-Z0-9]/g,"");
  return(cleaned||"?").slice(0,2);
}

export function fallbackAssetSvg(symbol:string,assetClass:string){
  const initials=escapeXml(assetInitials(symbol));
  const palette=/krypto|crypto/i.test(assetClass)?["#e7f6ef","#18794e"]:/got|cash/i.test(assetClass)?["#fff4cc","#765b00"]:["#eef2ff","#4338ca"];
  return`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${palette[0]}"/><text x="48" y="56" text-anchor="middle" font-family="Arial,sans-serif" font-size="30" font-weight="800" fill="${palette[1]}">${initials}</text></svg>`;
}
