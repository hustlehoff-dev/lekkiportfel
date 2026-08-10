export type CostPosition={cost:number;value:number;assetClass?:string;costKnown?:boolean};

export function hasKnownCost(position:CostPosition){
  if(position.costKnown!==undefined)return position.costKnown;
  return position.assetClass==="Gotówka"||position.cost>0;
}

export function calculateOpenResult<T extends CostPosition>(positions:T[]){
  const included=positions.filter(hasKnownCost);
  const excluded=positions.filter(position=>!hasKnownCost(position));
  const cost=included.reduce((sum,position)=>sum+position.cost,0);
  const value=included.reduce((sum,position)=>sum+position.value,0);
  return{cost,value,profit:value-cost,included,excluded};
}
