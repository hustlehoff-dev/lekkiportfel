export type DividendForecastInput={date:string;symbol:string;amount:number;comment?:string;account?:string};
export type DividendForecastPosition={symbol:string;quantity:number;value?:number;account?:string};
export type DividendForecastItem={date:string;symbol:string;gross:number;net:number;confidence:string;accounts:string[]};
export type DividendForecastOptions={positions:DividendForecastPosition[];fxRates?:Record<string,number>;until?:Date;monthlyContribution?:number};
export type DividendContributionInput={date:string;type:string;amount:number;account?:string};

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
function plusMonths(date:Date,months:number){const next=new Date(date);next.setUTCMonth(next.getUTCMonth()+months);return next}
function perShareFromComment(comment=""){
  const match=comment.replace(",",".").match(/\b(PLN|USD|EUR|GBP)\s+([0-9]+(?:\.[0-9]+)?)\s*\/\s*SHR\b/i);
  if(!match)return null;
  const amount=Number(match[2]);
  return Number.isFinite(amount)&&amount>0?{currency:match[1].toUpperCase(),amount}:null;
}

export function inferMonthlyContribution(cash:DividendContributionInput[],today:Date){
  const start=new Date(today);start.setUTCFullYear(start.getUTCFullYear()-1);
  const recent=cash.filter(item=>atNoon(item.date)>=start&&atNoon(item.date)<=today&&Number.isFinite(item.amount)&&item.amount>0);
  const external=recent.filter(item=>/^(deposit|wp[lł]ata)$/i.test(item.type.trim()));
  const deposits=external.length?external:recent.filter(item=>/deposit|wp[lł]ata/i.test(item.type));
  return deposits.reduce((sum,item)=>sum+item.amount,0)/12;
}

export function buildDividendForecast(dividends:DividendForecastInput[],cash:DividendForecastInput[],today:Date,options:DividendForecastOptions){
  const active=new Map<string,{symbol:string;accounts:Set<string>;quantity:number;value:number}>();
  let portfolioValue=0;
  for(const position of options.positions){
    const symbol=normalized(position.symbol),account=normalized(position.account)||"PLN",quantity=Number(position.quantity),positionValue=Math.max(0,Number(position.value)||0);
    if(!symbol||!Number.isFinite(quantity)||quantity<=0)continue;
    const current=active.get(symbol);
    active.set(symbol,{symbol,accounts:new Set([...(current?.accounts||[]),account]),quantity:(current?.quantity||0)+quantity,value:(current?.value||0)+positionValue});
    portfolioValue+=positionValue;
  }
  if(!active.size)return[];

  const grouped=new Map<string,Map<string,{gross:number;comments:string[]}>>();
  for(const row of dividends){
    const symbol=normalized(row.symbol);
    if(!active.has(symbol)||!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||!Number.isFinite(row.amount)||row.amount<=0)continue;
    const dates=grouped.get(symbol)||new Map<string,{gross:number;comments:string[]}>();
    const payment=dates.get(row.date)||{gross:0,comments:[]};
    payment.gross+=row.amount;
    if(row.comment)payment.comments.push(row.comment);
    dates.set(row.date,payment);grouped.set(symbol,dates);
  }
  const taxByPayment=new Map<string,number>();
  for(const row of cash){
    if(!Number.isFinite(row.amount)||row.amount>=0)continue;
    const key=`${normalized(row.symbol)}:${row.date}`;
    taxByPayment.set(key,(taxByPayment.get(key)||0)+row.amount);
  }

  const horizon=options.until||plusMonths(today,12);
  const monthlyContribution=Math.max(0,Number(options.monthlyContribution)||0);
  const rawEvents:Array<DividendForecastItem&{cadence:string;history:number}>=[];
  for(const [symbol,dates] of grouped){
    const owner=active.get(symbol)!;
    const history=[...dates.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
    const recent=history.slice(-8);
    const gaps=recent.slice(1).map((row,index)=>(atNoon(row[0]).getTime()-atNoon(recent[index][0]).getTime())/day);
    let cadence:typeof cadences[number]|{months:12;minDays:300;maxDays:540;minDates:1;label:"roczny · niska pewność"}|undefined=cadences
      .filter(item=>recent.length>=item.minDates)
      .map(item=>({...item,matches:gaps.filter(gap=>gap>=item.minDays&&gap<=item.maxDays).length}))
      .filter(item=>item.matches>=item.minDates-1)
      .sort((a,b)=>b.matches-a.matches||a.months-b.months)[0];
    const [lastDate,lastPayment]=history.at(-1)!;
    const perShare=lastPayment.comments.map(perShareFromComment).find(Boolean);
    if(!cadence&&symbol.endsWith(".PL")&&perShare?.currency==="PLN")cadence={months:12,minDays:300,maxDays:540,minDates:1,label:"roczny · niska pewność"};
    if(!cadence)continue;
    const age=(today.getTime()-atNoon(lastDate).getTime())/day;
    if(age>cadence.maxDays*1.5)continue;

    const fx=perShare?options.fxRates?.[perShare.currency]:undefined;
    const tax=taxByPayment.get(`${symbol}:${lastDate}`)||0;
    const netRatio=lastPayment.gross>0?Math.max(0,Math.min(1,(lastPayment.gross+tax)/lastPayment.gross)):1;
    let next=plusMonths(atNoon(lastDate),cadence.months);let guard=0;
    while(next<=today&&guard++<24)next=plusMonths(next,cadence.months);
    while(next<=horizon){
      const monthsAhead=Math.max(0,(next.getUTCFullYear()-today.getUTCFullYear())*12+next.getUTCMonth()-today.getUTCMonth());
      const currentPrice=owner.quantity>0&&owner.value>0?owner.value/owner.quantity:0;
      const allocation=portfolioValue>0?owner.value/portfolioValue:0;
      const addedQuantity=currentPrice>0?monthlyContribution*allocation*monthsAhead/currentPrice:0;
      const projectedQuantity=owner.quantity+addedQuantity;
      const gross=perShare&&Number.isFinite(fx)&&Number(fx)>0?perShare.amount*projectedQuantity*Number(fx):lastPayment.gross*(projectedQuantity/owner.quantity);
      const net=gross*netRatio;
      rawEvents.push({date:iso(next),symbol:owner.symbol,gross,net,accounts:[...owner.accounts],cadence:cadence.label,history:history.length,confidence:`${history.length} dat · cykl ${cadence.label} · ${owner.quantity.toLocaleString("pl-PL")} szt.`});
      next=plusMonths(next,cadence.months);
    }
  }

  const merged=new Map<string,DividendForecastItem&{cadences:Set<string>;history:number}>();
  for(const event of rawEvents){
    const key=`${event.date}:${event.symbol}`,current=merged.get(key);
    if(current){current.gross+=event.gross;current.net+=event.net;current.accounts=[...new Set([...current.accounts,...event.accounts])];current.history=Math.max(current.history,event.history);current.cadences.add(event.cadence)}
    else merged.set(key,{date:event.date,symbol:event.symbol,gross:event.gross,net:event.net,accounts:event.accounts,history:event.history,cadences:new Set([event.cadence]),confidence:event.confidence});
  }
  return[...merged.values()].map(item=>({...item,confidence:`${item.history} ${item.history===1?"data":item.history<5?"daty":"dat"} · cykl ${[...item.cadences].join("/")} · łącznie ${item.accounts.length} ${item.accounts.length===1?"rachunek":item.accounts.length<5?"rachunki":"rachunków"}`})).sort((a,b)=>a.date.localeCompare(b.date));
}
