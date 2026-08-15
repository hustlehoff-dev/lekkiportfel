export const STABLE_ASSET_CLASS="Stable" as const;

const stablecoinSymbols=new Set([
  "USDT","USDC","DAI","FDUSD","TUSD","USDP","PYUSD","USDD","USDE","USD0","RLUSD",
  "FRAX","LUSD","GUSD","SUSD","CRVUSD","EURC","EURT",
]);

function normalizedSymbol(symbol?:string){
  return String(symbol||"").trim().toUpperCase().split(/[.\-]/,1)[0];
}

export function isStablecoin(symbol?:string){
  return stablecoinSymbols.has(normalizedSymbol(symbol));
}

export function isCryptoAssetClass(assetClass?:string){
  return /^(Krypto|Crypto|Stable)$/i.test(String(assetClass||"").trim());
}

export function classifyAssetClass(symbol:string,assetClass:string){
  if(isStablecoin(symbol)&&isCryptoAssetClass(assetClass))return STABLE_ASSET_CLASS;
  return assetClass;
}
