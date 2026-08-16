import type { CryptoTaxTransaction, LossSetting } from "../lib/tax-calculator";

export type Sector = "Technologia" | "Finanse" | "Zdrowie" | "Konsumpcja" | "Przemysł" | "Energia" | "Nieruchomości" | "ETF" | "Inne";
export type Position = { id:string; symbol:string; name:string; sector:Sector; assetClass:string; quantity:number; cost:number; costKnown?:boolean; value:number; currency:string; account?:string; provider?:string; manual?:boolean; priceId?:string; image?:string; marketPrice?:number; priceUpdatedAt?:string; priceProvider?:string; priceChangePct?:number|null; priceQuality?:"live"|"cached"|"stale" };
export type PriceStatus = { loading:boolean; updatedAt:string|null; updated:number; missing:string[]; status:"idle"|"complete"|"partial"|"stale"|"error"; quality:{live:number;cached:number;stale:number;missing:number} };
export type CurrencyCode = "PLN"|"USD"|"EUR"|"GBP";
export type DesignTheme = "lekka"|"dark";
export type PrivacyMode = "visible"|"money"|"all";
export type SidebarStyle = "rail"|"island";
export type AppView = "pulpit"|"wykresy"|"dywidendy"|"podatki"|"historia"|"faq"|"bezpieczenstwo";
export type ManualKind = "Aktywa" | "Gotówka" | "Inne";
export type InstrumentResult = { key:string; symbol:string; name:string; assetClass:"Krypto"|"Stable"|"Akcje"|"ETF"; exchange:string; priceId?:string; image?:string; rank?:number|null; sector?:string; pricePln?:number };
export type CashEvent = { id:string; sourceId?:string; positionId?:string; date:string; type:string; instrument?:string; symbol:string; category?:string; product?:string; comment:string; amount:number; account?:string; provider?:string };
export type OpenLot = { id:string; positionId?:string; product?:string; category?:string; symbol:string; side:string; quantity:number; openDate:string; openPrice:number; cost:number; value:number; account?:string; provider?:string; openCommission?:number; swap?:number; rollover?:number; grossProfit?:number; netProfit?:number };
export type ClosedTrade = { id:string; positionId?:string; instrument?:string; product?:string; date:string; symbol:string; side:string; volume:number; result:number; account?:string; provider?:string; category?:string; openDate?:string; openPrice?:number; closePrice?:number; purchaseValue?:number; saleValue?:number; grossProfit?:number; commission?:number; swap?:number; rollover?:number; openConversionRate?:number; closeConversionRate?:number; closeOrigin?:string; comment?:string };
export type CryptoTransaction = CryptoTaxTransaction & { id:string; symbol:string; name:string; quantity:number; toSymbol?:string; toName?:string; toQuantity?:number; amount:number; currency:string; nbpRate:number; nbpDate?:string; fee:number; account:string; provider?:string; note?:string };
export type PortfolioData = { positions:Position[]; cash:CashEvent[]; trades:ClosedTrade[]; lots?:OpenLot[]; taxLosses?:Record<string,LossSetting>; cryptoTransactions?:CryptoTransaction[]; cryptoCostOverrides?:Record<string,number>; source:string };
export type PerformancePoint = { month:string; label:string; capitalGain:number; portfolioPct:number; benchmarkPct:number; investedCapital:number; openingValue?:number; closingValue?:number; netFlow?:number };
export type PerformanceResponse = { points:PerformancePoint[]; benchmark:{symbol:string;name:string}; missing:string[]; methodology:string; methodologyCode?:string; quality?:"complete"|"partial" };

export const viewPaths:Record<AppView,string>={pulpit:"/",wykresy:"/wykresy",dywidendy:"/dywidendy",podatki:"/podatki",historia:"/historia",faq:"/faq",bezpieczenstwo:"/bezpieczenstwo"};
export function viewFromPath(pathname:string):AppView{return (Object.entries(viewPaths).find(([,path])=>path===pathname)?.[0] as AppView|undefined)||"pulpit"}

export const sectors:Sector[]=["Technologia","Finanse","Zdrowie","Konsumpcja","Przemysł","Energia","Nieruchomości","ETF","Inne"];
export const emptyData:PortfolioData={positions:[],cash:[],trades:[],lots:[],source:"Nowy portfel"};
export const ALL_PROVIDERS="all";
export const DEFAULT_CHART_COLOR="#67b58f";
