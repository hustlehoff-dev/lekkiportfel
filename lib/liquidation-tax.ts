import { calculateCryptoTax, calculateLossCarryforward, calculateTaxSummary, isRetirementAccount, type CryptoTaxTransaction, type LossSetting, type TaxCashEvent, type TaxTrade } from "./tax-calculator.ts";
import { hasKnownCost } from "./portfolio-metrics.ts";

export type LiquidationPosition={symbol:string;name:string;assetClass:string;account?:string;cost:number;costKnown?:boolean;value:number};
export type LiquidationCryptoTransaction=CryptoTaxTransaction&{symbol?:string;toSymbol?:string};

export function calculateRetirementExitTax({ikeValue,ikeBasis,ikzeValue,mode,ikzeRate=12}:{
  ikeValue:number;ikeBasis:number;ikzeValue:number;mode:"assets"|"early"|"qualified";ikzeRate?:12|32;
}){
  const ikeIncome=Math.max(0,ikeValue-ikeBasis);
  const ikeTax=mode==="early"?Math.round(ikeIncome*.19):0;
  const ikzeTax=mode==="early"?Math.round(ikzeValue*ikzeRate/100):mode==="qualified"?Math.round(ikzeValue*.1):0;
  return{ikeIncome,ikeTax,ikzeTax,total:ikeTax+ikzeTax,ikzeRate};
}

export function calculateLiquidationTax({
  asOf,positions,trades,cash,cryptoTransactions,lossSettings={},cryptoCostOverrides={},
}:{
  asOf:Date;
  positions:LiquidationPosition[];
  trades:TaxTrade[];
  cash:TaxCashEvent[];
  cryptoTransactions:LiquidationCryptoTransaction[];
  lossSettings?:Record<string,LossSetting>;
  cryptoCostOverrides?:Record<string,number>;
}){
  const year=asOf.getFullYear(),date=asOf.toISOString().slice(0,10);
  const ordinary=positions.filter(position=>!isRetirementAccount(position.account));
  const retirement=positions.filter(position=>isRetirementAccount(position.account));
  const ike=retirement.filter(position=>/^IKE$/i.test(position.account?.trim()||""));
  const ikze=retirement.filter(position=>/^IKZE$/i.test(position.account?.trim()||""));
  const securities=ordinary.filter(position=>/^(Akcje|ETF|REIT)$/i.test(position.assetClass));
  const retirementSecurities=retirement.filter(position=>/^(Akcje|ETF|REIT)$/i.test(position.assetClass));
  const crypto=ordinary.filter(position=>/^Krypto$/i.test(position.assetClass));
  const other=ordinary.filter(position=>!securities.includes(position)&&!crypto.includes(position)&&position.assetClass!=="Gotówka");
  const cashPositions=ordinary.filter(position=>position.assetClass==="Gotówka");
  const knownSecurities=securities.filter(hasKnownCost),unknownSecurities=securities.filter(position=>!hasKnownCost(position));
  const knownRetirementSecurities=retirementSecurities.filter(hasKnownCost);
  const knownIke=ike.filter(hasKnownCost);
  const hypotheticalTrades:TaxTrade[]=knownSecurities.map((position,index)=>({
    id:`liquidation-${index}`,date,symbol:position.symbol,result:position.value-position.cost,
    saleValue:position.value,purchaseValue:position.cost,account:position.account,
  }));

  const summaryFor=(scenarioTrades:TaxTrade[])=>{
    const beforeLoss=calculateTaxSummary({year,trades:scenarioTrades,cash});
    const losses=calculateLossCarryforward({targetYear:year,trades:scenarioTrades,currentIncome:beforeLoss.trades.result,settings:lossSettings});
    const summary=calculateTaxSummary({year,trades:scenarioTrades,cash,eligiblePriorLoss:losses.totalDeduction});
    return{summary,losses,beforeLoss};
  };
  const existingSecurities=summaryFor(trades);
  const afterSecurities=summaryFor([...trades,...hypotheticalTrades]);

  const cryptoOverride=cryptoCostOverrides[String(year)];
  const existingCrypto=calculateCryptoTax({year,transactions:cryptoTransactions,priorCostsOverride:cryptoOverride});
  const usesCryptoLedger=cryptoTransactions.length>0;
  const knownCrypto=crypto.filter(hasKnownCost),unknownCrypto=crypto.filter(position=>!hasKnownCost(position));
  const ledgerSymbols=new Set(cryptoTransactions.flatMap(transaction=>[transaction.symbol,transaction.toSymbol]).filter((symbol):symbol is string=>Boolean(symbol)).map(symbol=>symbol.toUpperCase()));
  const coveredCrypto=crypto.filter(position=>ledgerSymbols.has(position.symbol.toUpperCase())||hasKnownCost(position));
  const uncoveredCrypto=crypto.filter(position=>!ledgerSymbols.has(position.symbol.toUpperCase())&&!hasKnownCost(position));
  const supplementalCrypto=usesCryptoLedger?knownCrypto.filter(position=>!ledgerSymbols.has(position.symbol.toUpperCase())):[];
  const cryptoSaleValue=(usesCryptoLedger?coveredCrypto:knownCrypto).reduce((sum,position)=>sum+position.value,0);
  const cryptoPositionCost=knownCrypto.reduce((sum,position)=>sum+position.cost,0);
  const afterCrypto=usesCryptoLedger
    ? calculateCryptoTax({year,transactions:[...cryptoTransactions,...supplementalCrypto.map((position,index)=>({id:`liquidation-cost-${index}`,date,type:"buy" as const,amountPln:position.cost,feePln:0})),{id:"liquidation",date,type:"sell",amountPln:cryptoSaleValue,feePln:0}],priorCostsOverride:cryptoOverride})
    : (()=>{const income=Math.max(0,cryptoSaleValue-cryptoPositionCost),taxableBase=Math.round(income),taxBeforeRounding=Math.round(taxableBase*.19*100)/100;return{...existingCrypto,revenue:cryptoSaleValue,currentCosts:cryptoPositionCost,priorCosts:0,income,unclaimedCosts:Math.max(0,cryptoPositionCost-cryptoSaleValue),taxableBase,taxBeforeRounding,tax:Math.round(taxBeforeRounding)}})();

  const excludedUnknown=[...unknownSecurities,...(usesCryptoLedger?uncoveredCrypto:unknownCrypto)];
  const existingTotal=existingSecurities.summary.totalTaxDue+existingCrypto.tax;
  const totalTax=afterSecurities.summary.totalTaxDue+afterCrypto.tax;
  const totalTaxBeforePriorLoss=afterSecurities.beforeLoss.totalTaxDue+afterCrypto.tax;
  return{
    year,date,totalTax,totalTaxBeforePriorLoss,existingTotal,taxChange:totalTax-existingTotal,
    securities:{
      saleValue:knownSecurities.reduce((sum,position)=>sum+position.value,0),
      cost:knownSecurities.reduce((sum,position)=>sum+position.cost,0),
      liquidationResult:knownSecurities.reduce((sum,position)=>sum+position.value-position.cost,0),
      allAccountsResult:[...knownSecurities,...knownRetirementSecurities].reduce((sum,position)=>sum+position.value-position.cost,0),
      currentYearResult:existingSecurities.summary.trades.result,
      taxableBase:afterSecurities.summary.trades.taxableBase,
      priorLossDeduction:afterSecurities.losses.totalDeduction,
      taxBeforePriorLoss:afterSecurities.beforeLoss.trades.tax,
      tax:afterSecurities.summary.trades.tax,
      positions:knownSecurities.length,
    },
    crypto:{
      saleValue:cryptoSaleValue,positionCost:cryptoPositionCost,taxableBase:afterCrypto.taxableBase,
      tax:afterCrypto.tax,positions:(usesCryptoLedger?coveredCrypto:knownCrypto).length,usesLedger:usesCryptoLedger,supplementalPositions:supplementalCrypto.length,
    },
    foreignDividendTax:afterSecurities.summary.foreignDividends.taxDue,
    excluded:{
      unknownCost:excludedUnknown,
      unknownCostValue:excludedUnknown.reduce((sum,position)=>sum+position.value,0),
      retirementValue:retirement.reduce((sum,position)=>sum+position.value,0),
      retirementResult:knownRetirementSecurities.reduce((sum,position)=>sum+position.value-position.cost,0),
      retirementResultPositions:knownRetirementSecurities.length,
      ikeValue:ike.reduce((sum,position)=>sum+position.value,0),
      ikeBasis:knownIke.reduce((sum,position)=>sum+position.cost,0),
      ikeBasisComplete:knownIke.length===ike.length,
      ikzeValue:ikze.reduce((sum,position)=>sum+position.value,0),
      cashValue:cashPositions.reduce((sum,position)=>sum+position.value,0),
      otherValue:other.reduce((sum,position)=>sum+position.value,0),
    },
  };
}
