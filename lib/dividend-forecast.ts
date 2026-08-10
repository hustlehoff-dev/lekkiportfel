export type DividendForecastInput={date:string;symbol:string;amount:number;comment?:string;account?:string};
export type DividendForecastPosition={symbol:string;quantity:number;account?:string};
export type DividendForecastItem={date:string;symbol:string;gross:number;net:number;confidence:string;accounts:string[]};
export type DividendForecastOptions={positions:DividendForecastPosition[];fxRates?:Record<string,number>};

const day=86_400_000;
const cadences=[
  {months:1,minDays:20,maxDays:45,minDates:6,label:"miesięczny"},
  {months:3,minDays:70,maxDays:115,minDates:4,label:"kwartalny"},
  {months:6,minDays:150,maxDays:220,minDates:3,label:"półroczny"},
  {months:12,minDays:300,maxDays:430,minDates:2,label:"roczny"},
] as const;

const atNoon=(date:string)=>new Date(`${date.slice(0,10)}T12:00:00Z`);
const iso=(date:Date)=>date.toISOString().slice(0,10);
const normalized=(value="")=>value.trim().toUpperCase();
const accountKey=(symbol:string,account="")=>`${normalized(account)||"PLN"}::${normalized(symbol)}`;
function plusMonths(date:Date,months:number){const next=new Date(date);next.setUTCMonth(next.getUTCMonth()+months);return next}
function perShareFromComment(comment=""){
  const match=comment.replace(",",".").match(/\b(PLN|USD|EUR|GBP)\s+([0-9]+(?:\.[0-9]+)?)\s*\/\s*SHR\b/i);
  if(!match)return null;
  const amount=Number(match[2]);
  return Number.isFinite(amount)&&amount>0?{currency:match[1].toUpperCase(),amount}:null;
}

export function buildDividendForecast(dividends:DividendForecastInput[],cash:DividendForecastInput[],today:Date,options:DividendForecastOptions){
  const active=new Map<string,{symbol:string;account:string;quantity:number}>();
  for(const position of options.positions){
    const symbol=normalized(position.symbol),account=normalized(position.account)||"PLN",quantity=Number(position.quantity);
    if(!symbol||!Number.isFinite(quantity)||quantity<=0)continue;
    const key=accountKey(symbol,account),current=active.get(key);
    active.set(key,{symbol,account,quantity:(current?.quantity||0)+quantity});
  }
  if(!active.size)return[];

  const grouped=new Map<string,Map<string,{gross:number;comments:string[]}>>();
  for(const row of dividends){
    const key=accountKey(row.symbol,row.account);
    if(!active.has(key)||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(row.amount)||row.amount<=0)continue;
    const dates=grouped.get(key)||new Map<string,{gross:number;comments:string[]}>();
    const payment=dates.get(row.date)||{gross:0,comments:[]};
    payment.gross+=row.amount;
    if(row.comment)payment.comments.push(row.comment);
    dates.set(row.date,payment);grouped.set(key,dates);
  }
  const taxByPayment=new Map<string,number>();
  for(const row of cash){
    if(!Number.isFinite(row.amount)||row.amount>=0)continue;
    const key=`${accountKey(row.symbol,row.account)}:${row.date}`;
    taxByPayment.set(key,(taxByPayment.get(key)||0)+row.amount);
  }

  const horizon=plusMonths(today,12);
  const rawEvents:Array<DividendForecastItem&{cadence:string;history:number}>=[];
  for(const [key,dates] of grouped){
    const owner=active.get(key)!;
    const history=[...dates.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const recent=history.slice(-8);
    const gaps=recent.slice(1).map((row,index)=>(atNoon(row[0]).getTime()-atNoon(recent[index][0]).getTime())/day);
    const cadence=cadences
      .filter(item=>recent.length>=item.minDates)
      .map(item=>({...item,matches:gaps.filter(gap=>gap>=item.minDays&&gap<=item.maxDays).length}))
      .filter(item=>item.matches>=item.minDates-1)
      .sort((a,b)=>b.matches-a.matches||a.months-b.months)[0];
    if(!cadence)continue;
    const [lastDate,lastPayment]=history.at(-1)!;
    const age=(today.getTime()-atNoon(lastDate).getTime())/day;
    if(age>cadence.maxDays*1.5)continue;

    const perShare=lastPayment.comments.map(perShareFromComment).find(Boolean);
    const fx=perShare?options.fxRates?.[perShare.currency]:undefined;
    const gross=perShare&&Number.isFinite(fx)&&Number(fx)>0?perShare.amount*owner.quantity*Number(fx):lastPayment.gross;
    const tax=taxByPayment.get(`${key}:${lastDate}`)||0;
    const netRatio=lastPayment.gross>0?Math.max(0,Math.min(1,(lastPayment.gross+tax)/lastPayment.gross)):1;
    const net=gross*netRatio;
    let next=plusMonths(atNoon(lastDate),cadence.months);let guard=0;
    while(next<=today&&guard++<24)next=plusMonths(next,cadence.months);
    while(next<=horizon){
      rawEvents.push({date:iso(next),symbol:owner.symbol,gross,net,accounts:[owner.account],cadence:cadence.label,history:history.length,confidence:`${history.length} dat · cykl ${cadence.label} · ${owner.quantity.toLocaleString("pl-PL")} szt.`});
      next=plusMonths(next,cadence.months);
    }
  }

  const merged=new Map<string,DividendForecastItem&{cadences:Set<string>;history:number}>();
  for(const event of rawEvents){
    const key=`${event.date}:${event.symbol}`,current=merged.get(key);
    if(current){current.gross+=event.gross;current.net+=event.net;current.accounts=[...new Set([...current.accounts,...event.accounts])];current.history=Math.max(current.history,event.history);current.cadences.add(event.cadence)}
    else merged.set(key,{date:event.date,symbol:event.symbol,gross:event.gross,net:event.net,accounts:event.accounts,history:event.history,cadences:new Set([event.cadence]),confidence:event.confidence});
  }
  return[...merged.values()].map(item=>({...item,confidence:`${item.history} dat · cykl ${[...item.cadences].join("/")} · ${item.accounts.join(" + ")}`})).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,50);
}
