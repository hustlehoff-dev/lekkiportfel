export const ALL_MARKETS="all" as const;

export type MarketFilter=typeof ALL_MARKETS|"gpw"|"foreign"|"crypto"|"cash"|"other";
export type MarketItem={symbol?:string;instrument?:string;product?:string;assetClass?:string};

export const marketFilterLabels:Record<MarketFilter,string>={
  all:"Wszystkie",
  gpw:"GPW",
  foreign:"Zagranica",
  crypto:"Krypto",
  cash:"Gotówka",
  other:"Pozostałe",
};

export const marketFilterOrder:MarketFilter[]=[ALL_MARKETS,"gpw","foreign","crypto","cash","other"];

const normalized=(value?:string)=>String(value||"").trim().toUpperCase();

export function marketFor(item:MarketItem):Exclude<MarketFilter,"all">{
  const assetClass=normalized(item.assetClass);
  const instrument=[item.symbol,item.instrument,item.product].map(normalized).filter(Boolean).join(" ");
  if(assetClass.includes("GOTÓW")||assetClass.includes("GOTOW"))return"cash";
  if(assetClass.includes("KRYPTO")||assetClass.includes("CRYPTO"))return"crypto";
  if(/\.(PL|WA)\b/.test(instrument))return"gpw";
  if(assetClass==="AKCJE"||assetClass==="ETF"||/\.(US|UK|L|DE|FR|NL|ES|IT|CH)\b/.test(instrument))return"foreign";
  return"other";
}

export function matchesMarket(item:MarketItem,market:MarketFilter){
  return market===ALL_MARKETS||marketFor(item)===market;
}
