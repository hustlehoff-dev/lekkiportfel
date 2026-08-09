"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import readXlsxFile from "read-excel-file/browser";
import { unzipSync } from "fflate";
import {
  ArrowRight,
  ArrowUpRight,
  BellRing,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  Database,
  Ellipsis,
  History,
  Info,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  ServerCog,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  Trash2,
  Upload,
  UserCheck,
  WalletCards,
  X,
} from "lucide-react";

type Sector = "Technologia" | "Finanse" | "Zdrowie" | "Konsumpcja" | "Przemysł" | "Energia" | "Nieruchomości" | "ETF" | "Inne";
type Position = { id:string; symbol:string; name:string; sector:Sector; assetClass:string; quantity:number; cost:number; value:number; currency:string; account?:string; manual?:boolean; priceId?:string; marketPrice?:number; priceUpdatedAt?:string; priceProvider?:string; priceChangePct?:number|null };
type PriceStatus = { loading:boolean; updatedAt:string|null; updated:number; missing:string[] };
type CurrencyCode = "PLN"|"USD"|"EUR"|"GBP";
type DesignTheme = "lekka"|"dark";
type AppView = "pulpit"|"dywidendy"|"historia"|"faq"|"bezpieczenstwo";
type ManualKind = "Aktywa" | "Gotówka" | "Inne";
type InstrumentResult = { key:string; symbol:string; name:string; assetClass:"Krypto"|"Akcje"|"ETF"; exchange:string; priceId?:string; image?:string; rank?:number|null; sector?:string; pricePln?:number };

const viewPaths:Record<AppView,string>={pulpit:"/",dywidendy:"/dywidendy",historia:"/historia",faq:"/faq",bezpieczenstwo:"/bezpieczenstwo"};
function viewFromPath(pathname:string):AppView{return (Object.entries(viewPaths).find(([,path])=>path===pathname)?.[0] as AppView|undefined)||"pulpit"}
type CashEvent = { id:string; sourceId?:string; positionId?:string; date:string; type:string; instrument?:string; symbol:string; category?:string; product?:string; comment:string; amount:number; account?:string };
type OpenLot = { id:string; positionId?:string; product?:string; category?:string; symbol:string; side:string; quantity:number; openDate:string; openPrice:number; cost:number; value:number; account?:string; openCommission?:number; swap?:number; rollover?:number; grossProfit?:number; netProfit?:number };
type ClosedTrade = { id:string; positionId?:string; instrument?:string; product?:string; date:string; symbol:string; side:string; volume:number; result:number; account?:string; category?:string; openDate?:string; openPrice?:number; closePrice?:number; purchaseValue?:number; saleValue?:number; grossProfit?:number; commission?:number; swap?:number; rollover?:number; openConversionRate?:number; closeConversionRate?:number; closeOrigin?:string; comment?:string };
type PortfolioData = { positions:Position[]; cash:CashEvent[]; trades:ClosedTrade[]; lots?:OpenLot[]; source:string };
type PerformancePoint = { month:string; label:string; capitalGain:number; portfolioPct:number; benchmarkPct:number; investedCapital:number };
type PerformanceResponse = { points:PerformancePoint[]; benchmark:{symbol:string;name:string}; missing:string[]; methodology:string };

const sectors: Sector[] = ["Technologia","Finanse","Zdrowie","Konsumpcja","Przemysł","Energia","Nieruchomości","ETF","Inne"];
const today = new Date();
const iso = (date:Date) => date.toISOString().slice(0,10);
const dateBack = (months:number, day=12) => iso(new Date(today.getFullYear(),today.getMonth()-months,day));

const demoData: PortfolioData = {
  source:"Portfel demonstracyjny",
  positions:[
    {id:"p1",symbol:"MSFT.US",name:"Microsoft",sector:"Technologia",assetClass:"Akcje",quantity:7,cost:9864,value:12462,currency:"PLN"},
    {id:"p2",symbol:"CSPX.UK",name:"iShares Core S&P 500",sector:"ETF",assetClass:"ETF",quantity:11,cost:11840,value:13776,currency:"PLN"},
    {id:"p3",symbol:"PKO.PL",name:"PKO Bank Polski",sector:"Finanse",assetClass:"Akcje",quantity:120,cost:5760,value:6828,currency:"PLN"},
    {id:"p4",symbol:"NOVO-B.DK",name:"Novo Nordisk",sector:"Zdrowie",assetClass:"Akcje",quantity:12,cost:5140,value:4632,currency:"PLN"},
    {id:"p5",symbol:"XOM.US",name:"Exxon Mobil",sector:"Energia",assetClass:"Akcje",quantity:9,cost:3720,value:4023,currency:"PLN"},
    {id:"p6",symbol:"O.US",name:"Realty Income",sector:"Nieruchomości",assetClass:"REIT",quantity:14,cost:3180,value:3374,currency:"PLN"},
  ],
  cash:[
    {id:"c1",date:dateBack(1,18),type:"DIVIDENT",symbol:"O.US",comment:"O.US USD 0.2685 / SHR",amount:14.74},
    {id:"c2",date:dateBack(1,18),type:"Withholding Tax",symbol:"O.US",comment:"O.US USD WHT 15%",amount:-2.21},
    {id:"c3",date:dateBack(2,10),type:"DIVIDENT",symbol:"MSFT.US",comment:"MSFT.US USD 0.83 / SHR",amount:23.61},
    {id:"c4",date:dateBack(2,10),type:"Withholding Tax",symbol:"MSFT.US",comment:"MSFT.US USD WHT 15%",amount:-3.54},
    {id:"c5",date:dateBack(3,18),type:"DIVIDENT",symbol:"O.US",comment:"O.US USD 0.2680 / SHR",amount:14.48},
    {id:"c6",date:dateBack(3,18),type:"Withholding Tax",symbol:"O.US",comment:"O.US USD WHT 15%",amount:-2.17},
    {id:"c7",date:dateBack(4,22),type:"DIVIDENT",symbol:"PKO.PL",comment:"PKO.PL PLN 5.48 / SHR",amount:657.6},
    {id:"c8",date:dateBack(5,18),type:"DIVIDENT",symbol:"O.US",comment:"O.US USD 0.2675 / SHR",amount:14.22},
    {id:"c9",date:dateBack(5,18),type:"Withholding Tax",symbol:"O.US",comment:"O.US USD WHT 15%",amount:-2.13},
    {id:"c10",date:dateBack(8,10),type:"DIVIDENT",symbol:"MSFT.US",comment:"MSFT.US USD 0.83 / SHR",amount:22.94},
    {id:"c11",date:dateBack(8,10),type:"Withholding Tax",symbol:"MSFT.US",comment:"MSFT.US USD WHT 15%",amount:-3.44},
    {id:"c12",date:dateBack(14,4),type:"Deposit",symbol:"",comment:"Wpłata środków",amount:30000},
  ],
  trades:[
    {id:"t1",date:dateBack(2,4),symbol:"AAPL.US",side:"SELL",volume:5,result:1240.4},
    {id:"t2",date:dateBack(6,21),symbol:"CDR.PL",side:"SELL",volume:18,result:-416.2},
    {id:"t3",date:dateBack(10,8),symbol:"VWCE.DE",side:"SELL",volume:4,result:583.6},
  ],
};

const number = (value:number,digits=2) => new Intl.NumberFormat("pl-PL",{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
const dateLabel = (value:string) => new Intl.DateTimeFormat("pl-PL",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value));
const norm = (value:unknown) => String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
const reportText = (value:unknown) => { const text=String(value??"").trim(); return text==="3"?"":text };
const num = (value:unknown) => { if(typeof value==="number") return value; const clean=String(value??"").replace(/\s/g,"").replace(/[^0-9,.-]/g,""); const normalized=clean.includes(",")&&!clean.includes(".")?clean.replace(",","."):clean.replace(/,/g,""); return Number(normalized)||0 };
const asDate = (value:unknown) => { if(value instanceof Date)return iso(value); if(typeof value==="number")return iso(new Date(Date.UTC(1899,11,30+value))); const s=String(value??"").trim(); const dm=s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/); if(dm)return `${dm[3]}-${dm[2].padStart(2,"0")}-${dm[1].padStart(2,"0")}`; const parsed=new Date(s); return Number.isNaN(parsed.getTime())?iso(today):iso(parsed) };
const sectorFor = (symbol:string):Sector => { const s=symbol.toUpperCase(); const known:Record<string,Sector>={"ABE.PL":"Technologia","ASB.PL":"Technologia","CBF.PL":"Technologia","DIG.PL":"Konsumpcja","EQIX.US":"Nieruchomości","PAS.PL":"Technologia","PLTR.US":"Technologia","S2B.PL":"Technologia","SNT.PL":"Zdrowie","XTB.PL":"Finanse","ADC.US":"Nieruchomości","DNP.PL":"Konsumpcja","KRU.PL":"Finanse","LPP.PL":"Konsumpcja","NNN.US":"Nieruchomości","CVX.US":"Energia","DTLA.UK":"ETF","MBR.PL":"Przemysł","TSLA.US":"Konsumpcja"}; if(known[s])return known[s]; if(/CSPX|VWCE|IWDA|ETF|SPY|QQQ|IUIT/.test(s))return"ETF"; if(/MSFT|AAPL|NVDA|GOOG|META|AMD|ASML|CDR/.test(s))return"Technologia"; if(/PKO|PEO|ING|JPM|BAC|V|MA/.test(s))return"Finanse"; if(/NOVO|JNJ|PFE|MRK|ABBV/.test(s))return"Zdrowie"; if(/XOM|CVX|SHEL|ORLEN|PKN/.test(s))return"Energia"; if(/O\.US|PLD|AMT|REIT/.test(s))return"Nieruchomości"; return"Inne" };
const sectorFromSearch = (value?:string):Sector => {const sector=norm(value);if(/tech|communication/.test(sector))return"Technologia";if(/financial/.test(sector))return"Finanse";if(/health/.test(sector))return"Zdrowie";if(/consumer/.test(sector))return"Konsumpcja";if(/industrial|materials/.test(sector))return"Przemysł";if(/energy|utilities/.test(sector))return"Energia";if(/real estate/.test(sector))return"Nieruchomości";return"Inne"};
const pick = (map:Record<string,number>,names:string[]) => { for(const name of names)if(map[name]!==undefined)return map[name]; return -1 };
const optionalReportText = (row:unknown[],index:number) => index>=0?(reportText(row[index])||undefined):undefined;
const optionalReportNumber = (row:unknown[],index:number) => {const value=optionalReportText(row,index);return value===undefined?undefined:num(value)};

function parseRows(rows:unknown[][],sheetName:string,target:PortfolioData,account="PLN"){
  const normalized=rows.map(row=>row.map(norm));
  const headerIndex=normalized.findIndex(row=>(row.includes("symbol")||row.includes("ticker"))&&(row.includes("amount")||row.includes("kwota")||row.includes("gross p/l")||row.includes("gross profit")||row.includes("profit/loss")||row.includes("purchase value")||row.includes("value")));
  if(headerIndex<0)return;
  const headers:Record<string,number>={}; normalized[headerIndex].forEach((header,index)=>{if(header)headers[header]=index});
  const idx={symbol:pick(headers,["symbol","ticker"]),name:pick(headers,["instrument","instrument/position","instrument finansowy"]),category:pick(headers,["category","kategoria"]),product:pick(headers,["product"]),type:pick(headers,["type","typ"]),time:pick(headers,["time","czas","open time","open time (utc)","czas otwarcia"]),closeTime:pick(headers,["close time","close time (utc)","czas zamkniecia"]),comment:pick(headers,["comment","komentarz"]),amount:pick(headers,["amount","kwota"]),sourceId:pick(headers,["id"]),positionId:pick(headers,["position id","id pozycji"]),volume:pick(headers,["volume","wolumen"]),purchase:pick(headers,["purchase value","wartosc zakupu"]),sale:pick(headers,["sale value","wartosc sprzedazy"]),value:pick(headers,["value","market value","wartosc rynkowa"]),marketPrice:pick(headers,["current price","market price","cena rynkowa"]),openPrice:pick(headers,["open price","cena otwarcia"]),closePrice:pick(headers,["close price","cena zamkniecia"]),netProfit:pick(headers,["net profit","profit/loss","zysk/strata"]),gross:pick(headers,["gross p/l","gross profit","wynik brutto"]),commission:pick(headers,["commission","open commission","prowizja"]),swap:pick(headers,["swap"]),rollover:pick(headers,["rollover"]),openConversionRate:pick(headers,["open conversion rate"]),closeConversionRate:pick(headers,["close conversion rate"]),closeOrigin:pick(headers,["close origin"])};
  const dataRows=rows.slice(headerIndex+1).filter(row=>row.some(cell=>String(cell??"").trim()));
  const isCash=idx.amount>=0; const isClosed=/closed|zamkniet/.test(norm(sheetName))||idx.closeTime>=0;
  if(isCash)dataRows.forEach((row,i)=>{const type=String(row[idx.type]??"").trim();const amount=num(row[idx.amount]);if(norm(type)==="total"||(!type&&!amount))return;target.cash.push({id:`cash-${account}-${sheetName}-${i}`,sourceId:optionalReportText(row,idx.sourceId),positionId:optionalReportText(row,idx.positionId),date:asDate(row[idx.time]),type,instrument:optionalReportText(row,idx.name),symbol:reportText(row[idx.symbol]),category:optionalReportText(row,idx.category),product:optionalReportText(row,idx.product),comment:reportText(row[idx.comment]),amount,account})});
  else if(isClosed)dataRows.forEach((row,i)=>{const symbol=reportText(row[idx.symbol]);if(!symbol)return;const result=idx.netProfit>=0?num(row[idx.netProfit]):num(row[idx.gross])+num(row[idx.commission])+num(row[idx.swap]);target.trades.push({id:`trade-${account}-${sheetName}-${i}`,positionId:optionalReportText(row,idx.positionId),instrument:optionalReportText(row,idx.name),product:optionalReportText(row,idx.product),date:asDate(row[idx.closeTime>=0?idx.closeTime:idx.time]),symbol,side:String(row[idx.type]??"").trim(),volume:num(row[idx.volume]),result,account,category:optionalReportText(row,idx.category),openDate:idx.time>=0?asDate(row[idx.time]):undefined,openPrice:optionalReportNumber(row,idx.openPrice),closePrice:optionalReportNumber(row,idx.closePrice),purchaseValue:idx.purchase>=0?Math.abs(num(row[idx.purchase])):undefined,saleValue:idx.sale>=0?Math.abs(num(row[idx.sale])):undefined,grossProfit:optionalReportNumber(row,idx.gross),commission:optionalReportNumber(row,idx.commission),swap:optionalReportNumber(row,idx.swap),rollover:optionalReportNumber(row,idx.rollover),openConversionRate:optionalReportNumber(row,idx.openConversionRate),closeConversionRate:optionalReportNumber(row,idx.closeConversionRate),closeOrigin:optionalReportText(row,idx.closeOrigin),comment:optionalReportText(row,idx.comment)})});
  else {const lotRows=dataRows.filter(row=>{const side=norm(row[idx.type]);return side==="buy"||side==="sell"});target.lots??=[];lotRows.forEach((row,i)=>{const symbol=reportText(row[idx.symbol]);if(!symbol)return;const profit=idx.netProfit>=0?num(row[idx.netProfit]):num(row[idx.gross]);const quantity=Math.abs(num(row[idx.volume]));const value=Math.abs(num(row[idx.value]))||Math.abs(num(row[idx.marketPrice])*quantity);const cost=Math.max(0,value-profit);const rawPositionId=optionalReportText(row,idx.name);target.lots!.push({id:`lot-${account}-${sheetName}-${i}`,positionId:rawPositionId&&/^\d+$/.test(rawPositionId)?rawPositionId:undefined,product:optionalReportText(row,idx.product),category:optionalReportText(row,idx.category),symbol,side:String(row[idx.type]??"").trim(),quantity,openDate:asDate(row[idx.time]),openPrice:num(row[idx.openPrice]),cost,value,account,openCommission:optionalReportNumber(row,idx.commission),swap:optionalReportNumber(row,idx.swap),rollover:optionalReportNumber(row,idx.rollover),grossProfit:optionalReportNumber(row,idx.gross),netProfit:optionalReportNumber(row,idx.netProfit)})});const hasSummaryRows=dataRows.some(row=>{const symbol=reportText(row[idx.symbol]);const side=norm(row[idx.type]);return symbol&&side!=="buy"&&side!=="sell"});const positionRows=hasSummaryRows?dataRows.filter(row=>{const side=norm(row[idx.type]);return side!=="buy"&&side!=="sell"}):dataRows;positionRows.forEach((row,i)=>{const symbol=reportText(row[idx.symbol]);if(!symbol)return;const profit=idx.netProfit>=0?num(row[idx.netProfit]):num(row[idx.gross]);let value=Math.abs(num(row[idx.value]));let cost=Math.abs(num(row[idx.purchase]));if(!value&&idx.marketPrice>=0&&idx.volume>=0)value=Math.abs(num(row[idx.marketPrice])*num(row[idx.volume]));if(!cost)cost=value-profit;const category=reportText(row[idx.category]);const rawName=reportText(row[idx.name])||symbol;const detectedSector=sectorFor(symbol);target.positions.push({id:`position-${account}-${sheetName}-${i}`,symbol,name:/^\d+$/.test(rawName)?symbol:rawName,sector:detectedSector,assetClass:/etf/i.test(category)||detectedSector==="ETF"?"ETF":"Akcje",quantity:num(row[idx.volume]),cost,value:value||cost,currency:"PLN",account})})};
}

function csvRows(text:string):string[][]{const lines=text.replace(/^\uFEFF/,"").split(/\r?\n/).filter(Boolean);const delimiter=(lines[0]?.match(/;/g)?.length??0)>(lines[0]?.match(/,/g)?.length??0)?";":",";return lines.map(line=>{const result:string[]=[];let cell="",quoted=false;for(let i=0;i<line.length;i++){const char=line[i];if(char==='"'&&line[i+1]==='"'){cell+='"';i++}else if(char==='"')quoted=!quoted;else if(char===delimiter&&!quoted){result.push(cell);cell=""}else cell+=char}result.push(cell);return result})}

function Donut({items,total,formatMoney}:{items:{label:string;value:number;color:string}[];total:number;formatMoney:(value:number,digits?:number)=>string}){const stops=items.map((item,index)=>{const start=items.slice(0,index).reduce((sum,row)=>sum+(total?row.value/total*360:0),0);const end=start+(total?item.value/total*360:0);return`${item.color} ${start}deg ${end}deg`}).join(", ");return <div className="donut" style={{background:`conic-gradient(${stops||"#e4e6df 0 360deg"})`}}><div className="donut-hole"><span>Wartość</span><strong>{formatMoney(total)}</strong></div></div>}

function PerformanceChart({points,mode,formatMoney}:{points:PerformancePoint[];mode:"value"|"market";formatMoney:(value:number,digits?:number)=>string}){
  const values=points.flatMap(point=>mode==="value"?[point.capitalGain]:[point.portfolioPct,point.benchmarkPct]);
  const ceiling=Math.max(1,...values.map(value=>Math.abs(value)));
  const labelStep=Math.max(1,Math.ceil(points.length/10));
  return <div className={`performance-chart ${mode}`}>
    <div className="performance-scale"><span>{mode==="value"?formatMoney(ceiling):`${number(ceiling,1)}%`}</span><span>0</span><span>{mode==="value"?formatMoney(-ceiling):`${number(-ceiling,1)}%`}</span></div>
    <div className="performance-columns">
      {points.map((point,index)=>{const bars=mode==="value"?[{value:point.capitalGain,kind:"portfolio"}]:[{value:point.portfolioPct,kind:"portfolio"},{value:point.benchmarkPct,kind:"benchmark"}];return <div className="performance-column" key={point.month} title={mode==="value"?`${point.label}: ${formatMoney(point.capitalGain,2)}`:`${point.label}: portfel ${number(point.portfolioPct,2)}%, S&P 500 ${number(point.benchmarkPct,2)}%`}><div className="bar-field"><span className="zero-axis"/>{bars.map(bar=><i key={bar.kind} className={`${bar.kind} ${bar.value<0?"negative":"positive-bar"}`} style={{height:`${Math.max(bar.value===0?0:2,Math.abs(bar.value)/ceiling*46)}%`}}/>)}</div><span className="month-label">{index%labelStep===0||index===points.length-1?point.label:""}</span></div>})}
    </div>
  </div>
}

export default function Home({initialView="pulpit"}:{initialView?:AppView}={}){
  const [data,setData]=useState<PortfolioData>(demoData);
  const [view,setView]=useState<AppView>(initialView);
  const [mobileMoreOpen,setMobileMoreOpen]=useState(false);
  const [allocation,setAllocation]=useState<"firma"|"sektor"|"klasa">("firma");
  const [account,setAccount]=useState("Wszystkie");
  const [addingAsset,setAddingAsset]=useState(false);
  const [manualKind,setManualKind]=useState<ManualKind>("Aktywa");
  const [assetQuery,setAssetQuery]=useState("");
  const [searchResults,setSearchResults]=useState<InstrumentResult[]>([]);
  const [selectedInstrument,setSelectedInstrument]=useState<InstrumentResult|null>(null);
  const [searching,setSearching]=useState(false);
  const [activeResult,setActiveResult]=useState(0);
  const [portfolioQuery,setPortfolioQuery]=useState("");
  const [displayCurrency,setDisplayCurrency]=useState<CurrencyCode>("PLN");
  const [designTheme,setDesignTheme]=useState<DesignTheme>("lekka");
  const [fxRates,setFxRates]=useState<Record<CurrencyCode,number>>({PLN:1,USD:1,EUR:1,GBP:1});
  const [performance,setPerformance]=useState<PerformanceResponse>({points:[],benchmark:{symbol:"^GSPC",name:"S&P 500 (PLN)"},missing:[],methodology:""});
  const [performanceLoading,setPerformanceLoading]=useState(false);
  const [performancePeriod,setPerformancePeriod]=useState<"6M"|"1R"|"3L"|"MAX">("1R");
  const [performanceMode,setPerformanceMode]=useState<"value"|"market">("value");
  const [priceStatus,setPriceStatus]=useState<PriceStatus>({loading:false,updatedAt:null,updated:0,missing:[]});
  const [importing,setImporting]=useState(false); const [notice,setNotice]=useState(""); const [dragging,setDragging]=useState(false); const fileRef=useRef<HTMLInputElement>(null);
  const portfolioSearchRef=useRef<HTMLInputElement>(null);
  const portfolioRef=useRef<PortfolioData>(demoData);
  const money=useCallback((value:number,digits=0)=>new Intl.NumberFormat("pl-PL",{style:"currency",currency:displayCurrency,maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value/(fxRates[displayCurrency]||1)),[displayCurrency,fxRates]);
  const changeCurrency=(currency:CurrencyCode)=>{setDisplayCurrency(currency);try{window.localStorage.setItem("kapital-currency",currency)}catch{}};
  const changeDesignTheme=(theme:DesignTheme)=>{setDesignTheme(theme);try{window.localStorage.setItem("kapital-theme",theme)}catch{}};
  useEffect(()=>{portfolioRef.current=data},[data]);
  useEffect(()=>{document.documentElement.dataset.portfolioTheme=designTheme},[designTheme]);
  useEffect(()=>{const timer=window.setTimeout(()=>{try{const saved=window.localStorage.getItem("kapital-theme");if(saved==="lekka"||saved==="dark")setDesignTheme(saved)}catch{}},0);return()=>window.clearTimeout(timer)},[]);
  useEffect(()=>{const onKeyDown=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();portfolioSearchRef.current?.focus()}};window.addEventListener("keydown",onKeyDown);return()=>window.removeEventListener("keydown",onKeyDown)},[]);
  useEffect(()=>{const savedTimer=window.setTimeout(()=>{try{const saved=window.localStorage.getItem("kapital-currency");if(saved==="PLN"||saved==="USD"||saved==="EUR"||saved==="GBP")setDisplayCurrency(saved)}catch{}},0);const controller=new AbortController();const load=()=>fetch("/api/fx",{signal:controller.signal}).then(response=>response.ok?response.json():Promise.reject()).then(result=>setFxRates(current=>({...current,...result.rates}))).catch(()=>undefined);void load();const timer=window.setInterval(load,5*60_000);return()=>{window.clearTimeout(savedTimer);controller.abort();window.clearInterval(timer)}},[]);
  const refreshPrices=useCallback(async(source?:PortfolioData,announce=false)=>{
    const portfolio=source||portfolioRef.current;const items=portfolio.positions.filter(item=>item.assetClass!=="Inne").map(item=>({id:item.id,symbol:item.symbol,assetClass:item.assetClass,currency:item.currency,priceId:item.priceId}));
    if(!items.length)return;setPriceStatus(current=>({...current,loading:true}));
    try{
      const result=await fetch("/api/prices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items})}).then(async response=>{if(!response.ok)throw new Error("serwis cen jest chwilowo niedostępny");return response.json()});
      const quotes=new Map<string,{pricePln:number;updatedAt:string;provider:string;changePct:number|null}>(result.quotes.map((quote:{id:string;pricePln:number;updatedAt:string;provider:string;changePct:number|null})=>[quote.id,quote]));
      setData(current=>{const next={...current,positions:current.positions.map(position=>{const quote=quotes.get(position.id);return quote?{...position,value:position.quantity*quote.pricePln,cost:position.assetClass==="Gotówka"?position.quantity*quote.pricePln:position.cost,marketPrice:quote.pricePln,priceUpdatedAt:quote.updatedAt,priceProvider:quote.provider,priceChangePct:quote.changePct}:position})};portfolioRef.current=next;return next});
      const missing=(result.missing||[]).map((item:{symbol:string})=>item.symbol);setPriceStatus({loading:false,updatedAt:result.updatedAt,updated:quotes.size,missing});
      if(announce)setNotice(missing.length?`Odświeżono ${quotes.size} notowań. Brak ceny dla: ${[...new Set(missing)].join(", ")}.`:`Odświeżono wszystkie ${quotes.size} notowania.`);
    }catch(error){setPriceStatus(current=>({...current,loading:false}));if(announce)setNotice(error instanceof Error?error.message:"Nie udało się pobrać cen.")}
  },[]);
  useEffect(()=>{let active=true;fetch("/api/portfolio").then(response=>response.ok?response.json():null).then(result=>{if(active&&result?.portfolio){portfolioRef.current=result.portfolio;setData(result.portfolio);void refreshPrices(result.portfolio)}}).catch(()=>undefined);const timer=window.setInterval(()=>void refreshPrices(),60000);return()=>{active=false;window.clearInterval(timer)}},[refreshPrices]);
  useEffect(()=>{if(!addingAsset||manualKind!=="Aktywa"||assetQuery.trim().length<2||(selectedInstrument&&assetQuery===`${selectedInstrument.name} (${selectedInstrument.symbol})`)){const reset=window.setTimeout(()=>{setSearchResults([]);setSearching(false)},0);return()=>window.clearTimeout(reset)}const controller=new AbortController();const timer=window.setTimeout(()=>{setSearching(true);const query=assetQuery.trim();Promise.all(["market","crypto"].map(kind=>fetch(`/api/instruments?q=${encodeURIComponent(query)}&kind=${kind}`,{signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error();return response.json()}))).then(([market,crypto])=>{const needle=query.toUpperCase();const merged=[...(market.results||[]),...(crypto.results||[])].sort((a:InstrumentResult,b:InstrumentResult)=>Number(b.symbol.toUpperCase()===needle)-Number(a.symbol.toUpperCase()===needle)||Number(b.name.toUpperCase()===needle)-Number(a.name.toUpperCase()===needle)||(a.rank??999999)-(b.rank??999999)).slice(0,10);setSearchResults(merged);setActiveResult(0)}).catch(()=>{if(!controller.signal.aborted)setSearchResults([])}).finally(()=>{if(!controller.signal.aborted)setSearching(false)})},280);return()=>{window.clearTimeout(timer);controller.abort()}},[addingAsset,assetQuery,manualKind,selectedInstrument]);
  const accounts=useMemo(()=>["Wszystkie",...Array.from(new Set([...data.positions,...data.cash,...data.trades].map(item=>item.account).filter(Boolean) as string[]))],[data]);
  const positions=useMemo(()=>account==="Wszystkie"?data.positions:data.positions.filter(item=>item.account===account),[account,data.positions]);
  const visiblePositions=useMemo(()=>{const query=norm(portfolioQuery);if(!query)return positions;return positions.filter(item=>norm([item.symbol,item.name,item.sector,item.assetClass,item.account].join(" ")).includes(query))},[portfolioQuery,positions]);
  const cash=useMemo(()=>account==="Wszystkie"?data.cash:data.cash.filter(item=>item.account===account),[account,data.cash]);
  const trades=useMemo(()=>account==="Wszystkie"?data.trades:data.trades.filter(item=>item.account===account),[account,data.trades]);
  const lots=useMemo(()=>{const rows=data.lots||[];return account==="Wszystkie"?rows:rows.filter(item=>item.account===account)},[account,data.lots]);
  useEffect(()=>{if(!lots.length&&!trades.some(trade=>trade.openDate))return;const controller=new AbortController();const timer=window.setTimeout(()=>{setPerformanceLoading(true);fetch("/api/performance",{method:"POST",headers:{"content-type":"application/json"},signal:controller.signal,body:JSON.stringify({lots,trades,positions})}).then(async response=>{if(!response.ok)throw new Error("Historia rynku jest chwilowo niedostępna");return response.json()}).then((result:PerformanceResponse)=>setPerformance(result)).catch(()=>{if(!controller.signal.aborted)setPerformance(current=>({...current,points:[]}))}).finally(()=>{if(!controller.signal.aborted)setPerformanceLoading(false)})},350);return()=>{window.clearTimeout(timer);controller.abort()}},[lots,positions,trades]);
  const performancePoints=useMemo(()=>{const limit=performancePeriod==="6M"?6:performancePeriod==="1R"?12:performancePeriod==="3L"?36:Infinity;return Number.isFinite(limit)?performance.points.slice(-limit):performance.points},[performance.points,performancePeriod]);
  const periodGain=performancePoints.reduce((sum,point)=>sum+point.capitalGain,0);
  const compounded=(key:"portfolioPct"|"benchmarkPct")=>(performancePoints.reduce((value,point)=>value*(1+point[key]/100),1)-1)*100;
  const portfolioPeriodReturn=compounded("portfolioPct"),benchmarkPeriodReturn=compounded("benchmarkPct");
  const bestMonth=performancePoints.length?[...performancePoints].sort((a,b)=>b.capitalGain-a.capitalGain)[0]:null;
  const totalValue=positions.reduce((s,p)=>s+p.value,0),totalCost=positions.reduce((s,p)=>s+p.cost,0),openProfit=totalValue-totalCost,realized=trades.reduce((s,t)=>s+t.result,0);
  const dividends=useMemo(()=>cash.filter(c=>/divident|dividend|dywidend/i.test(c.type)),[cash]); const taxes=cash.filter(c=>/withholding|podatek.*zrodl/i.test(norm(c.type))); const divGross=dividends.reduce((s,d)=>s+d.amount,0),divNet=divGross+taxes.reduce((s,t)=>s+t.amount,0);
  const forecast=useMemo(()=>{const grouped=new Map<string,CashEvent[]>();dividends.forEach(e=>grouped.set(e.symbol||"PORTFEL",[...(grouped.get(e.symbol||"PORTFEL")||[]),e]));const events:{date:string;symbol:string;gross:number;net:number;confidence:string}[]=[];grouped.forEach((rows,symbol)=>{const sorted=[...rows].sort((a,b)=>+new Date(a.date)-+new Date(b.date));const gaps=sorted.slice(1).map((r,i)=>(+new Date(r.date)-+new Date(sorted[i].date))/86400000);const median=gaps.length?[...gaps].sort((a,b)=>a-b)[Math.floor(gaps.length/2)]:365;const step=median<70?31:median<150?91:median<260?182:365;const last=sorted.at(-1)!;const tax=cash.filter(c=>c.symbol===symbol&&/withholding|podatek.*zrodl/i.test(norm(c.type))).at(-1)?.amount??0;let next=new Date(last.date),guard=0;while(next<=today&&guard++<24)next=new Date(next.getTime()+step*86400000);const end=new Date(today.getFullYear()+1,today.getMonth(),today.getDate());while(next<=end&&events.length<50){events.push({date:iso(next),symbol,gross:last.amount,net:Math.max(0,last.amount+tax),confidence:gaps.length>=2?"wyższa":"orientacyjna"});next=new Date(next.getTime()+step*86400000)}});return events.sort((a,b)=>+new Date(a.date)-+new Date(b.date))},[cash,dividends]);
  const forecastTotal=forecast.reduce((s,i)=>s+i.net,0);
  const allocationItems=useMemo(()=>{const map=new Map<string,number>();positions.forEach(p=>{const key=allocation==="firma"?p.symbol:allocation==="sektor"?p.sector:p.assetClass;map.set(key,(map.get(key)||0)+p.value)});const colors=["#67b58f","#6f9fd1","#d2aa62","#9b83c8","#d47f78","#65a9ac","#879a72","#bd8cad"];return[...map.entries()].sort((a,b)=>b[1]-a[1]).map(([label,value],i)=>({label,value,color:colors[i%colors.length]}))},[positions,allocation]);
  async function importFile(file?:File){
    if(!file)return;setImporting(true);setNotice("");
    const next:PortfolioData={positions:[],cash:[],trades:[],lots:[],source:file.name};
    const accountFor=(name:string)=>/^IKZE_/i.test(name)?"IKZE":/^IKE_/i.test(name)?"IKE":"PLN";
    const parseWorkbook=async(input:File,name:string)=>{const accountName=accountFor(name);if(/\.csv$/i.test(name))parseRows(csvRows(await input.text()),name,next,accountName);else{const sheets=await readXlsxFile(input);for(const sheet of sheets)parseRows(sheet.data as unknown[][],sheet.sheet,next,accountName)}};
    try{
      if(/\.zip$/i.test(file.name)){
        const archive=unzipSync(new Uint8Array(await file.arrayBuffer()));
        const reports=Object.entries(archive).filter(([name])=>/\.(xlsx|xls|csv)$/i.test(name));
        for(const [name,bytes] of reports)await parseWorkbook(new File([new Uint8Array(bytes)],name.split("/").at(-1)||name),name.split("/").at(-1)||name);
        next.source=`Użytkownik 1 · ${new Set(next.positions.map(item=>item.account)).size||reports.length} rachunki XTB`;
      }else await parseWorkbook(file,file.name);
      if(!next.positions.length&&!next.cash.length&&!next.trades.length)throw new Error("nie znaleziono tabel XTB");
      const manualPositions=data.positions.filter(item=>item.manual);
      if(manualPositions.length){next.positions.push(...manualPositions);next.source=`${next.source} · własne aktywa`}
      setData(next);setAccount("Wszystkie");
      const saved=await fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(next)}).then(response=>response.ok).catch(()=>false);
      setNotice(`${saved?"Zapisano Użytkownika 1.":"Wczytano lokalnie."} ${next.positions.length} pozycji otwartych i ${next.cash.length+next.trades.length} operacji.`);
      void refreshPrices(next);
    }catch(error){setNotice(`Nie udało się odczytać pliku: ${error instanceof Error?error.message:"nieznany format"}. Spróbuj pełnego eksportu ZIP/XLSX z xStation.`)}finally{setImporting(false)}
  }
  async function storePortfolio(next:PortfolioData){return fetch("/api/portfolio",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(next)}).then(response=>response.ok).catch(()=>false)}
  function commitPortfolio(next:PortfolioData,message?:string){setData(next);void storePortfolio(next).then(saved=>{if(message)setNotice(saved?message:"Zmiana jest widoczna, ale nie udało się jej zapisać.")})}
  function updateSector(id:string,sector:Sector){const next={...data,positions:data.positions.map(p=>p.id===id?{...p,sector}:p)};commitPortfolio(next)}
  function openAssetModal(){setManualKind("Aktywa");setAssetQuery("");setSearchResults([]);setSelectedInstrument(null);setSearching(false);setAddingAsset(true)}
  function changeManualKind(kind:ManualKind){setManualKind(kind);setAssetQuery("");setSearchResults([]);setSelectedInstrument(null);setActiveResult(0);setSearching(false)}
  async function chooseInstrument(instrument:InstrumentResult){setSelectedInstrument(instrument);setAssetQuery(`${instrument.name} (${instrument.symbol})`);setSearchResults([]);setSearching(false);if(instrument.pricePln)return;try{const result=await fetch("/api/prices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({items:[{id:"selection",symbol:instrument.symbol,assetClass:instrument.assetClass,priceId:instrument.priceId}]})}).then(response=>response.json());const quote=result.quotes?.[0];if(quote)setSelectedInstrument(current=>current?.key===instrument.key?{...current,pricePln:quote.pricePln}:current)}catch{}}
  function searchKeyDown(event:React.KeyboardEvent<HTMLInputElement>){if(event.key==="ArrowDown"){event.preventDefault();setActiveResult(current=>Math.min(current+1,searchResults.length-1))}else if(event.key==="ArrowUp"){event.preventDefault();setActiveResult(current=>Math.max(current-1,0))}else if(event.key==="Enter"&&searchResults[activeResult]){event.preventDefault();void chooseInstrument(searchResults[activeResult])}else if(event.key==="Escape"){setSearchResults([])}}
  function addManualAsset(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const form=new FormData(event.currentTarget);const text=(name:string)=>String(form.get(name)||"").trim();const amount=(name:string)=>num(text(name));
    const accountName=text("account")||"Poza XTB";let position:Position;
    if(manualKind==="Aktywa"){
      const quantity=amount("quantity"),cost=amount("totalCost");
      if(!selectedInstrument){setNotice("Najpierw wyszukaj i wybierz instrument z listy.");return}
      if(quantity<=0){setNotice("Podaj, ile sztuk posiadasz.");return}
      const price=selectedInstrument.pricePln||cost/quantity;
      position={id:`manual-${Date.now()}`,symbol:selectedInstrument.symbol,name:selectedInstrument.name,sector:selectedInstrument.assetClass==="ETF"?"ETF":selectedInstrument.assetClass==="Krypto"?"Inne":sectorFromSearch(selectedInstrument.sector),assetClass:selectedInstrument.assetClass,quantity,cost,value:quantity*price,currency:"PLN",account:accountName,manual:true,priceId:selectedInstrument.priceId,marketPrice:price||undefined,priceUpdatedAt:price?new Date().toISOString():undefined,priceProvider:selectedInstrument.assetClass==="Krypto"?"CoinGecko":"Yahoo Finance"};
    }else if(manualKind==="Gotówka"){
      const currency=text("currency").toUpperCase()||"PLN",quantity=amount("quantity");
      if(quantity<=0){setNotice("Kwota gotówki musi być większa od zera.");return}
      position={id:`manual-${Date.now()}`,symbol:currency,name:`Gotówka ${currency}`,sector:"Inne",assetClass:"Gotówka",quantity,cost:quantity,value:quantity,currency,account:accountName,manual:true};
    }else{
      const symbol=(text("symbol")||text("name")||"INNE").toUpperCase(),cost=amount("totalCost"),value=amount("currentValue");
      if(!text("name")||value<0){setNotice("Podaj nazwę i obecną wartość aktywa.");return}
      position={id:`manual-${Date.now()}`,symbol,name:text("name"),sector:"Inne",assetClass:"Inne",quantity:1,cost,value,currency:"PLN",account:accountName,manual:true};
    }
    const next={...data,positions:[...data.positions,position],source:data.source.includes("własne aktywa")?data.source:`${data.source} · własne aktywa`};
    commitPortfolio(next,`Dodano ${position.name} do portfela.`);setAccount("Wszystkie");setAddingAsset(false);setSelectedInstrument(null);setAssetQuery("");if(position.assetClass!=="Inne")void refreshPrices(next);
  }
  function removeManualAsset(position:Position){if(!window.confirm(`Usunąć ${position.name} z portfela?`))return;const next={...data,positions:data.positions.filter(item=>item.id!==position.id)};commitPortfolio(next,`Usunięto ${position.name} z portfela.`)}
  const history=[...trades.map(t=>({id:t.id,date:t.date,type:"Zamknięcie pozycji",symbol:t.symbol,detail:`${t.side} · ${number(t.volume)} szt. · ${t.account||"PLN"}`,amount:t.result})),...cash.map(c=>({id:c.id,date:c.date,type:c.type,symbol:c.symbol,detail:`${c.comment||"Operacja gotówkowa"} · ${c.account||"PLN"}`,amount:c.amount}))].sort((a,b)=>+new Date(b.date)-+new Date(a.date));
  const viewCopy:Record<AppView,{eyebrow:string;title:string;description:string}>={
    pulpit:{eyebrow:data.source,title:"Twój majątek",description:"Wszystkie aktywa, wyniki i przepływy w jednym prostym widoku."},
    dywidendy:{eyebrow:data.source,title:"Dywidendy",description:"Zebrane wpływy i prognoza kolejnych wypłat."},
    historia:{eyebrow:data.source,title:"Historia konta",description:"Pełna historia operacji ze wszystkich rachunków."},
    faq:{eyebrow:"Pomoc",title:"Najczęstsze pytania",description:"Krótkie odpowiedzi o imporcie danych, cenach, dywidendach i własnych aktywach."},
    bezpieczenstwo:{eyebrow:"Prywatność",title:"Bezpieczeństwo",description:"Jak chronimy dane całego portfela i co trafia do zewnętrznych dostawców."},
  };
  useEffect(()=>{const syncView=()=>{setView(viewFromPath(window.location.pathname));setMobileMoreOpen(false);window.scrollTo({top:0,left:0,behavior:"auto"})};window.addEventListener("popstate",syncView);return()=>window.removeEventListener("popstate",syncView)},[]);
  const selectView=(next:AppView)=>{const path=viewPaths[next];if(window.location.pathname!==path)window.history.pushState({},"",path);setView(next);setMobileMoreOpen(false);window.scrollTo({top:0,left:0,behavior:"auto"})};
  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><WalletCards size={19} strokeWidth={2}/></span><span>KAPITAŁ<small>prywatny portfel</small></span></div>
      <nav className="primary-nav" aria-label="Główna nawigacja">
        <button className={view==="pulpit"?"active":""} onClick={()=>selectView("pulpit")}><span><CalendarDays size={18} strokeWidth={1.9}/></span>Pulpit</button>
        <button className={view==="dywidendy"?"active":""} onClick={()=>selectView("dywidendy")}><span><ArrowUpRight size={18} strokeWidth={1.9}/></span>Dywidendy</button>
        <button className={view==="historia"?"active":""} onClick={()=>selectView("historia")}><span><History size={18} strokeWidth={1.9}/></span>Historia konta</button>
        <button className={mobileMoreOpen?"mobile-more active":"mobile-more"} onClick={()=>setMobileMoreOpen(open=>!open)}><span><Ellipsis size={20} strokeWidth={2.1}/></span>Więcej</button>
      </nav>
      <nav className="help-nav" aria-label="Pomoc">
        <button className={view==="faq"?"active":""} onClick={()=>selectView("faq")}><span><CircleHelp size={18} strokeWidth={1.9}/></span>Najczęstsze pytania</button>
        <button className={view==="bezpieczenstwo"?"active":""} onClick={()=>selectView("bezpieczenstwo")}><span><ShieldCheck size={18} strokeWidth={1.9}/></span>Bezpieczeństwo</button>
      </nav>
      <div className="privacy"><span>●</span><div><strong>Portfel zapisany w aplikacji</strong><p>Dostawcy notowań dostają symbol instrumentu, nie stan rachunku.</p></div></div>
      <button className="text-button" onClick={()=>setData(demoData)}>Przywróć dane demo</button>
    </aside>
    {mobileMoreOpen&&<><button className="mobile-more-backdrop" onClick={()=>setMobileMoreOpen(false)} aria-label="Zamknij menu"/><section className="mobile-more-panel" aria-label="Więcej">
      <header><strong>Więcej</strong><button onClick={()=>setMobileMoreOpen(false)} aria-label="Zamknij"><X size={18}/></button></header>
      <button onClick={()=>{setMobileMoreOpen(false);openAssetModal()}}><span><Plus size={18}/></span><div><strong>Dodaj aktywo</strong><small>Akcje, ETF, krypto, gotówka lub inne</small></div></button>
      <button onClick={()=>selectView("faq")}><span><CircleHelp size={18}/></span><div><strong>Najczęstsze pytania</strong><small>Import, ceny i działanie aplikacji</small></div></button>
      <button onClick={()=>selectView("bezpieczenstwo")}><span><ShieldCheck size={18}/></span><div><strong>Bezpieczeństwo</strong><small>Dane portfela i prywatność</small></div></button>
      <button onClick={()=>{setMobileMoreOpen(false);fileRef.current?.click()}}><span><Upload size={18}/></span><div><strong>Importuj XTB</strong><small>ZIP, XLSX, XLS lub CSV</small></div></button>
    </section></>}
    <section className="content"><header className="topbar"><div className="topbar-title"><p className="eyebrow">{viewCopy[view].eyebrow}</p><h1>{viewCopy[view].title}</h1></div><div className="mobile-brand"><span className="brand-mark"><WalletCards size={17} strokeWidth={2}/></span><strong>KAPITAŁ</strong></div><label className="topbar-search"><span aria-hidden="true"><Search size={18} strokeWidth={1.8}/></span><input ref={portfolioSearchRef} value={portfolioQuery} onChange={e=>setPortfolioQuery(e.target.value)} placeholder="Szukaj aktywa, symbolu lub rachunku…" aria-label="Szukaj w portfelu"/><kbd>Ctrl K</kbd></label><div className="top-actions"><select className="theme-select" value={designTheme} onChange={e=>changeDesignTheme(e.target.value as DesignTheme)} aria-label="Wygląd aplikacji"><option value="lekka">Lekka</option><option value="dark">Dark</option></select><select className="currency-select" value={displayCurrency} onChange={e=>changeCurrency(e.target.value as CurrencyCode)} aria-label="Waluta prezentacji"><option value="PLN">PLN zł</option><option value="USD">USD $</option><option value="EUR">EUR €</option><option value="GBP">GBP £</option></select>{accounts.length>1&&<select className="account-select" value={account} onChange={e=>setAccount(e.target.value)} aria-label="Rachunek">{accounts.map(item=><option key={item}>{item}</option>)}</select>}<button className="add-asset-button" onClick={openAssetModal}><span><Plus size={18} strokeWidth={2.4}/></span><b>Dodaj aktywo</b></button><span className="as-of">Stan na dziś</span><button className="import-button" onClick={()=>fileRef.current?.click()} disabled={importing}><span><Upload size={18} strokeWidth={1.9}/></span><b>{importing?"Wczytuję…":"Importuj XTB"}</b></button></div><input ref={fileRef} className="sr-only" type="file" accept=".zip,.xlsx,.xls,.csv" onChange={e=>importFile(e.target.files?.[0])}/></header>
    <div className="main-shell"><div className="main-content">{view!=="bezpieczenstwo"&&<section className="dashboard-intro"><p>{viewCopy[view].eyebrow}</p><h1>{viewCopy[view].title}</h1><span>{viewCopy[view].description}</span></section>}
    {view!=="bezpieczenstwo"&&<div className={`price-status ${priceStatus.loading?"loading":priceStatus.missing.length?"partial":"live"}`} role="status"><span className="live-dot"/><div><strong>{priceStatus.loading?"Pobieram aktualne ceny…":priceStatus.updatedAt?"Notowania są aktualne":"Oczekiwanie na notowania"}</strong><small>{priceStatus.updatedAt?`${priceStatus.updated} instrumentów · aktualizacja ${new Intl.DateTimeFormat("pl-PL",{hour:"2-digit",minute:"2-digit"}).format(new Date(priceStatus.updatedAt))}${priceStatus.missing.length?` · ${new Set(priceStatus.missing).size} bez ceny`:""}`:"Ceny odświeżą się automatycznie"}</small></div><button type="button" onClick={()=>void refreshPrices(undefined,true)} disabled={priceStatus.loading}><RefreshCw size={13} strokeWidth={1.9}/> Odśwież</button></div>}
    {notice&&<div className="notice" role="status"><span><Info size={14} strokeWidth={2}/></span>{notice}<button onClick={()=>setNotice("")} aria-label="Zamknij"><X size={15} strokeWidth={2}/></button></div>}
    {view==="pulpit"&&<><section className="hero-grid"><article className="value-card"><div className="metric-icon yellow"><WalletCards size={18} strokeWidth={1.9}/></div><p>Wartość portfela</p><h2>{money(totalValue)}</h2><div className={`profit-pill ${openProfit<0?"negative":""}`}>{openProfit>=0?"↑":"↓"} {money(Math.abs(openProfit),2)} <span>({totalCost?number(openProfit/totalCost*100):"0,00"}%)</span></div><small>Niezrealizowany wynik na aktywach</small></article><article className="metric-card"><div className="metric-icon green"><ArrowUpRight size={18} strokeWidth={1.9}/></div><p>Dywidendy netto</p><h3>{money(divNet,2)}</h3><small>Zebrane · cała historia</small><span className="micro">Brutto {money(divGross,2)}</span></article><article className="metric-card"><div className="metric-icon amber"><CalendarClock size={18} strokeWidth={1.9}/></div><p>Prognoza 12 mies.</p><h3>{money(forecastTotal,2)}</h3><small>Na bazie poprzednich wypłat</small><span className="micro">{forecast.length} przewidywanych wypłat</span></article><article className="metric-card"><div className="metric-icon dark"><Sigma size={18} strokeWidth={1.9}/></div><p>Wynik zrealizowany</p><h3 className={realized<0?"red":""}>{money(realized,2)}</h3><small>Zamknięte transakcje</small><span className="micro">{trades.length} operacje</span></article></section>
    <section className="panel performance-panel"><div className="performance-head"><div><p className="eyebrow">Rzeczywista historia</p><h3>{performanceMode==="value"?"Miesięczny wynik na wzroście aktywów":`Portfel vs ${performance.benchmark.name}`}</h3><small>{performanceMode==="value"?"Zmiana wyceny partii + rzeczywisty wynik sprzedaży z raportu XTB":"Miesięczna stopa zwrotu liczona w PLN"}</small></div><div className="performance-controls"><div className="segmented mode-switch"><button className={performanceMode==="value"?"active":""} onClick={()=>setPerformanceMode("value")}>Wynik PLN</button><button className={performanceMode==="market"?"active":""} onClick={()=>setPerformanceMode("market")}>vs rynek</button></div><div className="segmented period-switch">{(["6M","1R","3L","MAX"] as const).map(period=><button key={period} className={performancePeriod===period?"active":""} onClick={()=>setPerformancePeriod(period)}>{period}</button>)}</div></div></div>
      <div className="performance-summary"><div><span>Wynik okresu</span><strong className={periodGain>=0?"positive":"negative-text"}>{periodGain>=0?"+":""}{money(periodGain,2)}</strong></div><div><span>Stopa portfela</span><strong className={portfolioPeriodReturn>=0?"positive":"negative-text"}>{portfolioPeriodReturn>=0?"+":""}{number(portfolioPeriodReturn,2)}%</strong></div><div><span>S&P 500 w PLN</span><strong className={benchmarkPeriodReturn>=0?"positive":"negative-text"}>{benchmarkPeriodReturn>=0?"+":""}{number(benchmarkPeriodReturn,2)}%</strong></div><div><span>Najlepszy miesiąc</span><strong>{bestMonth?`${bestMonth.label} · ${money(bestMonth.capitalGain)}`:"—"}</strong></div></div>
      {performanceLoading&&!performancePoints.length?<div className="performance-empty"><span className="loading-ring"/>Liczymy historię każdej partii…</div>:performancePoints.length?<PerformanceChart points={performancePoints} mode={performanceMode} formatMoney={money}/>:<div className="performance-empty">Zaimportuj ponownie pełny ZIP XTB, aby dodać daty i ceny każdej partii do wykresu.</div>}
      <div className="performance-foot"><span><i className="legend-swatch portfolio"/>Portfel</span>{performanceMode==="market"&&<span><i className="legend-swatch benchmark"/>S&P 500 (PLN)</span>}<p>Bieżący miesiąc jest liczony do dziś. Najedź na słupek, aby zobaczyć dokładną wartość.{performance.missing.length?` Brak historii: ${performance.missing.join(", ")}.`:""}</p></div>
    </section>
    <section className="dashboard-grid"><article className="panel allocation-panel"><div className="panel-head"><div><p className="eyebrow">Struktura</p><h3>Rozkład portfela</h3></div><div className="segmented">{(["firma","sektor","klasa"] as const).map(item=><button key={item} className={allocation===item?"active":""} onClick={()=>setAllocation(item)}>{item==="firma"?"Spółka":item==="sektor"?"Sektor":"Klasa"}</button>)}</div></div><div className="allocation-body"><Donut items={allocationItems} total={totalValue} formatMoney={money}/><div className="legend">{allocationItems.slice(0,7).map(item=><div key={item.label}><span className="legend-dot" style={{background:item.color}}/><strong>{item.label}</strong><span>{totalValue?number(item.value/totalValue*100,1):"0,0"}%</span></div>)}</div></div></article><article className="panel forecast-panel"><div className="panel-head"><div><p className="eyebrow">Najbliższe 12 miesięcy</p><h3>Kalendarz wypłat</h3></div><button className="arrow-button" aria-label="Pokaż wszystkie dywidendy" onClick={()=>selectView("dywidendy")}><ArrowRight size={18} strokeWidth={1.9}/></button></div><div className="forecast-list">{forecast.slice(0,4).map(item=><div key={`${item.symbol}-${item.date}`}><div className="date-tile"><b>{new Date(item.date).getDate()}</b><span>{new Intl.DateTimeFormat("pl-PL",{month:"short"}).format(new Date(item.date))}</span></div><div><strong>{item.symbol}</strong><small>Prognoza · {item.confidence}</small></div><b>{money(item.net,2)}</b></div>)}{!forecast.length&&<div className="empty-inline">Brak historii dywidend do zbudowania prognozy.</div>}</div></article></section>
    <section className="panel positions-panel"><div className="panel-head"><div><p className="eyebrow">Aktywne pozycje</p><h3>Aktywa</h3></div><span className="count-pill">{visiblePositions.length}{portfolioQuery?` z ${positions.length}`:""} pozycji</span></div>{visiblePositions.length?<div className="table-wrap"><table><thead><tr><th>Instrument</th><th>Rachunek</th><th>Sektor</th><th>Ilość</th><th>Aktualna cena</th><th>Wartość</th><th>Koszt</th><th>Wynik</th><th>Udział</th></tr></thead><tbody>{visiblePositions.map(p=>{const profit=p.value-p.cost;return <tr key={p.id}><td><div className="asset"><span>{p.symbol.slice(0,2)}</span><div><strong>{p.symbol}</strong><small>{p.name}</small></div></div></td><td><span className="account-pill">{p.account||"PLN"}</span></td><td><select value={p.sector} onChange={e=>updateSector(p.id,e.target.value as Sector)} aria-label={`Sektor ${p.symbol}`}>{sectors.map(sector=><option key={sector}>{sector}</option>)}</select></td><td>{number(p.quantity)}</td><td className="market-price">{p.marketPrice?<><strong>{money(p.marketPrice,p.marketPrice<10?3:2)}</strong>{p.priceChangePct!=null&&<small className={p.priceChangePct>=0?"positive":"negative-text"}>{p.priceChangePct>=0?"+":""}{number(p.priceChangePct,2)}%</small>}</>:<span>—</span>}</td><td><strong>{money(p.value)}</strong></td><td>{money(p.cost)}</td><td className={profit>=0?"positive":"negative-text"}><strong>{profit>=0?"+":""}{money(profit)}</strong><small>{p.cost?`${profit>=0?"+":""}${number(profit/p.cost*100,1)}%`:"—"}</small></td><td><div className="weight"><span style={{width:`${totalValue?p.value/totalValue*100:0}%`}}/></div><small>{totalValue?number(p.value/totalValue*100,1):"0,0"}%</small></td></tr>})}</tbody></table></div>:positions.length?<div className="empty-positions search-empty-state"><div><Search size={28} strokeWidth={1.8}/></div><h4>Brak pasujących aktywów</h4><p>Zmień wyszukiwaną frazę albo wyczyść pole w górnym pasku.</p><span><button onClick={()=>setPortfolioQuery("")}>Wyczyść wyszukiwanie</button></span></div>:<EmptyPositions onImport={()=>fileRef.current?.click()} onDemo={()=>setData(demoData)}/>}</section>
    <section className={`dropzone ${dragging?"dragging":""}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);importFile(e.dataTransfer.files[0])}} onClick={()=>fileRef.current?.click()}><span className="upload-icon"><Upload size={18} strokeWidth={1.9}/></span><div><strong>Upuść pełny eksport XTB</strong><p>ZIP, XLSX, XLS lub CSV · obsługa wielu rachunków</p></div><button>Wybierz plik</button></section></>}
    {view==="dywidendy"&&<section className="subpage-grid"><article className="dividend-summary"><p className="eyebrow">Wpływy netto</p><h2>{money(divNet,2)}</h2><p>Łącznie od początku historii</p><div><span>Brutto <b>{money(divGross,2)}</b></span><span>Podatek u źródła <b>{money(Math.abs(divGross-divNet),2)}</b></span><span>Prognoza 12 mies. <b>{money(forecastTotal,2)}</b></span></div></article><article className="panel"><div className="panel-head"><div><p className="eyebrow">Prognoza</p><h3>Przyszłe wypłaty</h3></div><span className="count-pill">szacunek</span></div><div className="full-list">{forecast.map(item=><div key={`${item.symbol}-${item.date}`}><span className="status-dot forecast"/><div><strong>{item.symbol}</strong><small>{dateLabel(item.date)} · pewność {item.confidence}</small></div><b>{money(item.net,2)}</b></div>)}{!forecast.length&&<p className="empty-inline">Po imporcie historii dywidend pokażę tu prognozę.</p>}</div></article><article className="panel full"><div className="panel-head"><div><p className="eyebrow">Zaksięgowane</p><h3>Historia dywidend</h3></div><span className="count-pill">{dividends.length} wypłat</span></div><div className="full-list">{[...dividends].sort((a,b)=>+new Date(b.date)-+new Date(a.date)).map(item=><div key={item.id}><span className="status-dot"/><div><strong>{item.symbol||"Dywidenda"}</strong><small>{dateLabel(item.date)} · {item.comment}</small></div><b>{money(item.amount,2)}</b></div>)}</div></article></section>}
    {view==="historia"&&<section className="panel history-panel"><div className="history-summary"><div><span>Wszystkie operacje</span><strong>{history.length}</strong></div><div><span>Zamknięty wynik</span><strong className={realized>=0?"positive":"negative-text"}>{money(realized,2)}</strong></div><div><span>Przepływy gotówki</span><strong>{cash.length}</strong></div></div><div className="timeline">{history.map(item=><div key={item.id}><span className="timeline-dot"/><time>{dateLabel(item.date)}</time><div><strong>{item.type}</strong><small>{item.symbol?`${item.symbol} · `:""}{item.detail}</small></div><b className={item.amount>=0?"positive":"negative-text"}>{item.amount>=0?"+":""}{money(item.amount,2)}</b></div>)}{!history.length&&<p className="empty-inline">Brak operacji w zaimportowanym pliku.</p>}</div></section>}
    {view==="faq"&&<section className="support-page faq-page" aria-label="Najczęstsze pytania">
      <div className="faq-list">
        <details open><summary>Jak zaimportować pełną historię z XTB?<span><Plus size={18}/></span></summary><p>W XTB otwórz historię rachunku, ustaw pełny zakres dat i pobierz raport. Do Kapitału możesz wczytać cały ZIP albo plik XLSX, XLS lub CSV. Przy wielu rachunkach najlepiej użyć pełnego archiwum ZIP.</p></details>
        <details><summary>Czy ceny aktualizują się automatycznie?<span><Plus size={18}/></span></summary><p>Tak. Notowania odświeżają się po otwarciu aplikacji i cyklicznie w tle. Dla instrumentów bez jednoznacznego symbolu aplikacja pokazuje brak ceny zamiast zgadywać.</p></details>
        <details><summary>Czy mogę dodać krypto, stablecoiny i gotówkę?<span><Plus size={18}/></span></summary><p>Tak. Wybierz „Dodaj aktywo”, wyszukaj kryptowalutę albo stablecoin, a następnie podaj liczbę jednostek i koszt. Gotówkę możesz dodać osobno w PLN, EUR, USD, GBP i innych obsługiwanych walutach.</p></details>
        <details><summary>Skąd bierze się prognoza dywidend?<span><Plus size={18}/></span></summary><p>Prognoza wykorzystuje rzeczywiste wypłaty znalezione w historii XTB. To szacunek oparty na poprzednich wypłatach, a nie gwarancja przyszłej dywidendy.</p></details>
        <details><summary>Dlaczego wynik może różnić się od XTB?<span><Plus size={18}/></span></summary><p>Wpływ mają kursy walut, moment aktualizacji notowań, prowizje oraz sposób rozliczenia zamkniętych partii. Historia sprzedaży pochodzi z raportu, a bieżący wynik otwartych pozycji z aktualnej wyceny.</p></details>
        <details><summary>Jak działa zmiana waluty widoku?<span><Plus size={18}/></span></summary><p>PLN, USD, EUR i GBP zmieniają walutę prezentacji całego portfela. Dane źródłowe pozostają bez zmian, a wartości są przeliczane według aktualnych kursów NBP.</p></details>
      </div>
    </section>}
    {view==="bezpieczenstwo"&&<article className="support-page security-page" aria-label="Bezpieczeństwo">
      <header className="security-hero">
        <h1 className="security-eyebrow">Bezpieczeństwo</h1>
        <div className="security-badge"><ShieldCheck size={14}/>Ochrona danych portfela</div>
        <h2>Co przechowujemy, w jakim celu i jak możesz to usunąć.</h2>
        <p>Portfel może zawierać akcje, ETF-y, kryptowaluty, gotówkę, inne składniki majątku oraz historię operacji i dywidend. Poniżej opisujemy, gdzie zapisujemy te dane i jakie informacje przekazujemy dostawcom notowań.</p>
        <div className="security-pills" aria-label="Najważniejsze zabezpieczenia"><span><LockKeyhole size={14}/>Import pliku w przeglądarce</span><span><Database size={14}/>Zapis w bazie aplikacji</span><span><ShieldCheck size={14}/>Bez dostępu do rachunków</span><span><Upload size={14}/>Nadpisanie danych importem</span></div>
      </header>

      <div className="security-grid">
        <section><span className="support-icon"><LockKeyhole size={21}/></span><h2>Logowanie i sesja</h2><p>Obecna wersja nie ma jeszcze systemu kont, hasła ani sesji użytkownika. Aplikacja otwiera się bez logowania i korzysta z jednego technicznego profilu „user-1”. Nie podajesz jej danych logowania do brokera, banku ani giełdy kryptowalut.</p></section>
        <section><span className="support-icon"><Database size={21}/></span><h2>Dane bez konta</h2><p>Aktywa możesz dodać ręcznie albo zaimportować z obsługiwanego pliku. Po zapisaniu przetworzony portfel trafia do bazy aplikacji i wraca po odświeżeniu strony. Oryginalnego pliku nie przechowujemy.</p></section>
        <section><span className="support-icon"><UserCheck size={21}/></span><h2>Dane zespołu</h2><p>Obecne MVP nie ma zespołów ani rozdzielonych uprawnień. Wszystkie dane są zapisane pod profilem „user-1”, dlatego każda osoba z dostępem do tej instancji aplikacji może otworzyć ten sam portfel.</p></section>
        <section><span className="support-icon"><Trash2 size={21}/></span><h2>Usuwanie i eksport</h2><p>Nowy import nadpisuje poprzedni zapis profilu „user-1”. Aplikacja nie ma jeszcze osobnej funkcji trwałego usunięcia portfela z bazy ani eksportu wszystkich zapisanych danych.</p></section>
      </div>

      <section className="security-wide-card">
        <div className="security-section-head"><CheckCircle2 size={22}/><h2>Zabezpieczenia techniczne</h2></div>
        <div className="security-feature-grid">
          <div><ShieldCheck size={18}/><p>Połączenie z aplikacją jest szyfrowane przez HTTPS podczas korzystania z wersji hostowanej.</p></div>
          <div><LockKeyhole size={18}/><p>Dodawanie aktywów i import nie wymagają loginu, hasła, kodu SMS ani połączenia z zewnętrznym rachunkiem.</p></div>
          <div><Database size={18}/><p>Przetworzony portfel trafia do backendu aplikacji i jest zapisywany w jej bazie danych.</p></div>
          <div><ServerCog size={18}/><p>Dostawcy notowań otrzymują symbole i dane rynku, ale nie liczbę jednostek ani koszty zakupu.</p></div>
          <div><BellRing size={18}/><p>Moduł wyniku przetwarza na backendzie partie zakupu, transakcje i bieżące pozycje.</p></div>
          <div><CheckCircle2 size={18}/><p>Kursy walut pobieramy z NBP bez przekazywania danych portfela.</p></div>
        </div>
      </section>

      <section className="security-wide-card">
        <div className="security-section-head"><ServerCog size={22}/><h2>Dostawcy usług technicznych</h2></div>
        <p className="security-provider-copy">Aplikacja korzysta z Yahoo Finance do notowań akcji i ETF-ów, CoinGecko do danych o kryptowalutach oraz NBP do kursów walut. Serwer wysyła do tych usług zapytania potrzebne do znalezienia instrumentu albo ceny.</p>
        <p className="security-provider-copy">Zewnętrzni dostawcy nie otrzymują pliku importu, liczby posiadanych jednostek, kosztów zakupu ani łącznej wartości portfela. Przetworzony portfel jest jednak zapisywany i analizowany przez backend tej aplikacji.</p>
        <div className="security-links"><button onClick={()=>selectView("faq")}>Jak działa import</button><button onClick={()=>selectView("pulpit")}>Wróć do portfela</button></div>
      </section>

      <div className="security-grid security-bottom-grid">
        <section><span className="support-icon"><ShieldCheck size={21}/></span><h2>Ochrona Twojego konta</h2><p>Obecne MVP nie ma jeszcze konta chronionego hasłem. Dostęp do portfela ma każda osoba, która może otworzyć tę instancję aplikacji, dlatego nie należy wystawiać jej publicznie bez dodania logowania.</p><div className="security-links"><button onClick={()=>selectView("faq")}>Najczęstsze pytania</button></div></section>
        <section><span className="support-icon"><ShieldAlert size={21}/></span><h2>Zgłaszanie podatności</h2><p>Jeśli zauważysz błąd bezpieczeństwa, zgłoś go właścicielowi tej instancji. Opisz, jak odtworzyć problem, jakiego widoku dotyczy i czy mógł ujawnić albo zmienić dane portfela.</p></section>
      </div>

      <p className="security-note">Ten opis odzwierciedla sposób działania widoczny w aktualnym kodzie aplikacji. Po dodaniu logowania, osobnych kont użytkowników albo nowych integracji tę stronę trzeba zaktualizować.</p>
    </article>}
    {addingAsset&&<div className="modal-backdrop" role="presentation" tabIndex={-1} onKeyDown={e=>{if(e.key==="Escape")setAddingAsset(false)}} onMouseDown={e=>{if(e.currentTarget===e.target)setAddingAsset(false)}}>
      <section className="asset-modal" role="dialog" aria-modal="true" aria-labelledby="asset-modal-title">
        <header><div><p className="eyebrow">Poza XTB</p><h2 id="asset-modal-title">Dodaj własne aktywo</h2></div><button className="modal-close" type="button" onClick={()=>setAddingAsset(false)} aria-label="Zamknij"><X size={18} strokeWidth={2}/></button></header>
        <div className="asset-type-tabs" aria-label="Rodzaj aktywa">{(["Aktywa","Gotówka","Inne"] as ManualKind[]).map(kind=><button type="button" key={kind} className={manualKind===kind?"active":""} onClick={()=>changeManualKind(kind)}>{kind}</button>)}</div>
        <form key={manualKind} onSubmit={addManualAsset}><div className="form-grid">
          {manualKind==="Aktywa"&&<><label className="field full-field instrument-search"><span>Wyszukaj akcję, ETF lub kryptowalutę</span><div className="search-input"><Search size={17} strokeWidth={1.9} aria-hidden="true"/><input value={assetQuery} onChange={e=>{setAssetQuery(e.target.value);if(selectedInstrument)setSelectedInstrument(null)}} onKeyDown={searchKeyDown} placeholder="np. USDT, USDC, Bitcoin, Microsoft, XTB…" autoFocus role="combobox" aria-expanded={searchResults.length>0} aria-controls="instrument-results" aria-autocomplete="list" /><i className={searching?"search-spinner":""}/></div>{searchResults.length>0&&<div className="search-results" id="instrument-results" role="listbox">{searchResults.map((item,index)=><button type="button" role="option" aria-selected={index===activeResult} className={index===activeResult?"active":""} key={item.key} onMouseDown={e=>e.preventDefault()} onClick={()=>void chooseInstrument(item)}><span className="result-mark">{item.symbol.slice(0,2)}</span><span><strong>{item.name}</strong><small>{item.symbol} · {item.assetClass} · {item.exchange}{item.rank?` · #${item.rank}`:""}</small></span>{item.pricePln&&<b>{money(item.pricePln,item.pricePln<10?3:2)}</b>}</button>)}</div>}{!searching&&assetQuery.trim().length>=2&&!selectedInstrument&&!searchResults.length&&<small className="search-empty">Brak wyników — spróbuj pełnej nazwy albo symbolu.</small>}</label>{selectedInstrument&&<><div className="selected-instrument full-field"><span className="result-mark">{selectedInstrument.symbol.slice(0,2)}</span><div><strong>{selectedInstrument.name}</strong><small>{selectedInstrument.symbol} · {selectedInstrument.assetClass} · {selectedInstrument.exchange}</small></div><b>{selectedInstrument.pricePln?money(selectedInstrument.pricePln,selectedInstrument.pricePln<10?3:2):"Pobieram cenę…"}</b></div><label className="field"><span>Ile posiadasz?</span><input name="quantity" type="number" min="0" step="any" placeholder={selectedInstrument.assetClass==="Krypto"?"0,25":"10"} required /></label><label className="field"><span>Łącznie zainwestowano (PLN)</span><input name="totalCost" type="number" min="0" step="any" placeholder="10000" /></label></>}</>}
          {manualKind==="Gotówka"&&<><label className="field"><span>Waluta</span><select name="currency" defaultValue="PLN" autoFocus><option>PLN</option><option>EUR</option><option>USD</option><option>GBP</option><option>CHF</option><option>DKK</option><option>SEK</option><option>NOK</option></select></label><label className="field"><span>Kwota</span><input name="quantity" type="number" min="0" step="any" placeholder="10000" required /></label></>}
          {manualKind==="Inne"&&<><label className="field"><span>Nazwa</span><input name="name" placeholder="Złoto fizyczne" required autoFocus /></label><label className="field"><span>Symbol / skrót</span><input name="symbol" placeholder="ZŁOTO" /></label><label className="field"><span>Łączny koszt (PLN)</span><input name="totalCost" type="number" min="0" step="any" placeholder="10000" /></label><label className="field"><span>Obecna wartość (PLN)</span><input name="currentValue" type="number" min="0" step="any" placeholder="12500" required /></label></>}
          <label className="field full-field"><span>Rachunek / portfel</span><input name="account" defaultValue="Poza XTB" list="account-options" required /><datalist id="account-options">{accounts.filter(item=>item!=="Wszystkie").map(item=><option key={item} value={item}/>)}</datalist></label>
        </div><p className="form-hint">Nazwę, symbol, klasę aktywa, walutę i bieżącą cenę pobieramy automatycznie. Ty podajesz tylko stan posiadania i koszt zakupu.</p><div className="modal-actions"><button type="button" className="secondary-action" onClick={()=>setAddingAsset(false)}>Anuluj</button><button type="submit" className="primary-action" disabled={manualKind==="Aktywa"&&!selectedInstrument}>Dodaj do portfela</button></div></form>
        {data.positions.some(item=>item.manual)&&<div className="manual-assets"><p className="eyebrow">Dodane ręcznie</p>{data.positions.filter(item=>item.manual).map(item=><div key={item.id}><span><strong>{item.symbol}</strong><small>{item.account} · {money(item.value)}</small></span><button type="button" onClick={()=>removeManualAsset(item)} aria-label={`Usuń ${item.name}`}>Usuń</button></div>)}</div>}
      </section>
    </div>}
    {view!=="bezpieczenstwo"&&<footer><span>Kapitał</span><p>To narzędzie informacyjne — nie stanowi porady inwestycyjnej. Notowania mogą być opóźnione względem rynku.</p><b>Notowania online</b></footer>}</div></div></section>
  </main>
}

function EmptyPositions({onImport,onDemo}:{onImport:()=>void;onDemo:()=>void}){return <div className="empty-positions"><div><WalletCards size={20} strokeWidth={1.9}/></div><h4>Brakuje otwartych pozycji</h4><p>Historia XTB często zawiera tylko zamknięte transakcje. Wczytaj raport z tabelą „OPEN POSITION”, aby policzyć bieżący wynik i alokację.</p><span><button onClick={onImport}>Wczytaj raport</button><button className="secondary" onClick={onDemo}>Zobacz demo</button></span></div>}
