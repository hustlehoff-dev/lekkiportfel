import type { DividendForecastInput, DividendForecastItem } from "./dividend-forecast";

export type DividendForecastGroup={
  symbol:string;
  gross:number;
  net:number;
  nextDate:string;
  eventCount:number;
  accounts:string[];
  events:DividendForecastItem[];
};

export type DividendHistoryPayment={
  date:string;
  gross:number;
  tax:number;
  net:number;
  accounts:string[];
  entryCount:number;
};

export type DividendHistoryGroup={
  symbol:string;
  gross:number;
  tax:number;
  net:number;
  lastDate:string;
  paymentCount:number;
  entryCount:number;
  accounts:string[];
  payments:DividendHistoryPayment[];
};

const normalized=(value="")=>value.trim().toUpperCase();

export function groupDividendForecast(items:DividendForecastItem[]):DividendForecastGroup[]{
  const groups=new Map<string,DividendForecastItem[]>();
  for(const item of items){
    const symbol=normalized(item.symbol)||"DYWIDENDA";
    groups.set(symbol,[...(groups.get(symbol)||[]),item]);
  }

  return[...groups.entries()].map(([symbol,events])=>{
    const sorted=[...events].sort((a,b)=>a.date.localeCompare(b.date));
    return{
      symbol,
      gross:sorted.reduce((sum,item)=>sum+item.gross,0),
      net:sorted.reduce((sum,item)=>sum+item.net,0),
      nextDate:sorted[0]?.date||"",
      eventCount:sorted.length,
      accounts:[...new Set(sorted.flatMap(item=>item.accounts).filter(Boolean))],
      events:sorted,
    };
  }).sort((a,b)=>a.nextDate.localeCompare(b.nextDate)||b.net-a.net);
}

export function groupDividendHistory(dividends:DividendForecastInput[],taxes:DividendForecastInput[]):DividendHistoryGroup[]{
  const taxByPayment=new Map<string,number>();
  for(const item of taxes){
    const symbol=normalized(item.symbol)||"DYWIDENDA";
    const key=`${symbol}:${item.date}`;
    taxByPayment.set(key,(taxByPayment.get(key)||0)+Math.min(0,Number(item.amount)||0));
  }

  const payments=new Map<string,DividendHistoryPayment&{symbol:string}>();
  for(const item of dividends){
    if(!Number.isFinite(item.amount)||item.amount<=0)continue;
    const symbol=normalized(item.symbol)||"DYWIDENDA";
    const key=`${symbol}:${item.date}`;
    const current=payments.get(key)||{symbol,date:item.date,gross:0,tax:taxByPayment.get(key)||0,net:0,accounts:[],entryCount:0};
    current.gross+=item.amount;
    current.net=current.gross+current.tax;
    current.entryCount+=1;
    if(item.account&&!current.accounts.includes(item.account))current.accounts.push(item.account);
    payments.set(key,current);
  }

  const bySymbol=new Map<string,DividendHistoryPayment[]>();
  for(const payment of payments.values()){
    const clean:DividendHistoryPayment={date:payment.date,gross:payment.gross,tax:payment.tax,net:payment.net,accounts:payment.accounts,entryCount:payment.entryCount};
    bySymbol.set(payment.symbol,[...(bySymbol.get(payment.symbol)||[]),clean]);
  }

  return[...bySymbol.entries()].map(([symbol,rows])=>{
    const sorted=[...rows].sort((a,b)=>b.date.localeCompare(a.date));
    return{
      symbol,
      gross:sorted.reduce((sum,item)=>sum+item.gross,0),
      tax:sorted.reduce((sum,item)=>sum+item.tax,0),
      net:sorted.reduce((sum,item)=>sum+item.net,0),
      lastDate:sorted[0]?.date||"",
      paymentCount:sorted.length,
      entryCount:sorted.reduce((sum,item)=>sum+item.entryCount,0),
      accounts:[...new Set(sorted.flatMap(item=>item.accounts).filter(Boolean))],
      payments:sorted,
    };
  }).sort((a,b)=>b.lastDate.localeCompare(a.lastDate)||b.net-a.net);
}
