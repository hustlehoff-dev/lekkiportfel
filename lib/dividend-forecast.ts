export type DividendForecastInput={date:string;symbol:string;amount:number};
export type DividendForecastItem={date:string;symbol:string;gross:number;net:number;confidence:string};

const day=86_400_000;
const cadences=[
  {months:1,minDays:20,maxDays:45,minDates:4,label:"miesięczny"},
  {months:3,minDays:70,maxDays:115,minDates:3,label:"kwartalny"},
  {months:6,minDays:150,maxDays:220,minDates:3,label:"półroczny"},
  {months:12,minDays:300,maxDays:430,minDates:2,label:"roczny"},
] as const;

const atNoon=(date:string)=>new Date(`${date.slice(0,10)}T12:00:00Z`);
const iso=(date:Date)=>date.toISOString().slice(0,10);
function plusMonths(date:Date,months:number){const next=new Date(date);next.setUTCMonth(next.getUTCMonth()+months);return next}

export function buildDividendForecast(dividends:DividendForecastInput[],cash:DividendForecastInput[],today:Date){
  const grouped=new Map<string,Map<string,number>>();
  for(const row of dividends){
    const symbol=row.symbol.trim().toUpperCase();
    if(!symbol||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(row.amount)||row.amount<=0)continue;
    const dates=grouped.get(symbol)||new Map<string,number>();
    dates.set(row.date,(dates.get(row.date)||0)+row.amount);
    grouped.set(symbol,dates);
  }
  const taxByPayment=new Map<string,number>();
  for(const row of cash){
    if(!Number.isFinite(row.amount)||row.amount>=0)continue;
    const key=`${row.symbol.trim().toUpperCase()}:${row.date}`;
    taxByPayment.set(key,(taxByPayment.get(key)||0)+row.amount);
  }
  const horizon=plusMonths(today,12);const events:DividendForecastItem[]=[];
  for(const [symbol,dates] of grouped){
    const history=[...dates.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const gaps=history.slice(1).map((row,index)=>(atNoon(row[0]).getTime()-atNoon(history[index][0]).getTime())/day);
    const cadence=cadences
      .filter(item=>history.length>=item.minDates)
      .map(item=>({...item,matches:gaps.filter(gap=>gap>=item.minDays&&gap<=item.maxDays).length}))
      .filter(item=>item.matches>=Math.max(1,Math.ceil(gaps.length*.7)))
      .sort((a,b)=>b.matches-a.matches||a.months-b.months)[0];
    if(!cadence)continue;
    const [lastDate,gross]=history.at(-1)!;
    const net=Math.max(0,gross+(taxByPayment.get(`${symbol}:${lastDate}`)||0));
    let next=plusMonths(atNoon(lastDate),cadence.months);let guard=0;
    while(next<=today&&guard++<120)next=plusMonths(next,cadence.months);
    while(next<=horizon&&events.length<100){
      events.push({date:iso(next),symbol,gross,net,confidence:`${history.length} wypłat · cykl ${cadence.label}`});
      next=plusMonths(next,cadence.months);
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)).slice(0,50);
}
