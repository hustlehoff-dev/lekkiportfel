import { hasKnownCost } from "./portfolio-metrics";

export type GroupablePosition={
  id:string;symbol:string;name:string;assetClass:string;sector:string;quantity:number;cost:number;costKnown?:boolean;value:number;
  currency:string;account?:string;marketPrice?:number;priceChangePct?:number|null;
};

export type GroupedPosition<T extends GroupablePosition=T>=T&{
  items:T[];
  positionIds:string[];
  accounts:string[];
  positionCount:number;
};

export function groupPositionsByTicker<T extends GroupablePosition>(positions:T[]):GroupedPosition<T>[] {
  const groups=new Map<string,T[]>();
  for(const position of positions){
    const symbol=position.symbol.trim().toUpperCase().replace(/\s+/g,"");
    const key=`${position.assetClass.trim().toUpperCase()}:${symbol||position.name.trim().toUpperCase()}`;
    groups.set(key,[...(groups.get(key)||[]),position]);
  }
  return[...groups.entries()].map(([key,items])=>{
    const first=items[0];
    const quantity=items.reduce((sum,item)=>sum+item.quantity,0);
    const value=items.reduce((sum,item)=>sum+item.value,0);
    const priced=items.filter(item=>typeof item.priceChangePct==="number"&&Number.isFinite(item.priceChangePct));
    const pricedValue=priced.reduce((sum,item)=>sum+Math.max(0,item.value),0);
    const priceChangePct=priced.length
      ? priced.reduce((sum,item)=>sum+(item.priceChangePct||0)*(pricedValue?Math.max(0,item.value)/pricedValue:1/priced.length),0)
      : null;
    const accounts=[...new Set(items.map(item=>item.account||"PLN"))];
    return{
      ...first,
      id:`group-${key}`,
      symbol:first.symbol.trim().toUpperCase(),
      quantity,
      cost:items.reduce((sum,item)=>sum+item.cost,0),
      costKnown:items.every(hasKnownCost),
      value,
      account:accounts.length===1?accounts[0]:`${accounts.length} rachunki`,
      marketPrice:items.some(item=>item.marketPrice!=null)&&quantity?value/quantity:first.marketPrice,
      priceChangePct,
      items,
      positionIds:items.map(item=>item.id),
      accounts,
      positionCount:items.length,
    } as GroupedPosition<T>;
  }).sort((a,b)=>b.value-a.value);
}
