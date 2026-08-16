export type CostPosition={
  cost:number;
  value:number;
  assetClass?:string;
  costKnown?:boolean;
  symbol?:string;
  name?:string;
  items?:CostPosition[];
};

export function hasKnownCost(position:CostPosition){
  if(position.costKnown!==undefined)return position.costKnown;
  return position.assetClass==="Gotówka"||position.cost>0;
}

export function calculateOpenResult<T extends CostPosition>(positions:T[]){
  // Grouped rows are evaluated at lot/account level. One missing cost must not
  // exclude the known part of the whole instrument from the result.
  const leaves:T[]=[];
  const visit=(position:CostPosition)=>{
    if(position.items?.length){
      position.items.forEach(visit);
      return;
    }
    leaves.push(position as T);
  };
  positions.forEach(visit);

  const included=leaves.filter(hasKnownCost);
  const excluded=leaves.filter(position=>!hasKnownCost(position));
  const cost=included.reduce((sum,position)=>sum+position.cost,0);
  const value=included.reduce((sum,position)=>sum+position.value,0);
  const totalValue=leaves.reduce((sum,position)=>sum+position.value,0);
  const coveredValue=value;
  const isComplete=excluded.length===0;
  const coveragePercent=totalValue>0
    ? Math.max(0,Math.min(100,coveredValue/totalValue*100))
    : isComplete?100:0;
  const profit=value-cost;
  const returnPercent=cost>0?profit/cost*100:null;
  const missingCostSymbols=[...new Set(excluded
    .map(position=>(position.symbol||position.name||"").trim())
    .filter(Boolean))];

  return{
    cost,
    value,
    profit,
    included,
    excluded,
    totalValue,
    coveredValue,
    coveragePercent,
    isComplete,
    missingCostSymbols,
    returnPercent,
  };
}
