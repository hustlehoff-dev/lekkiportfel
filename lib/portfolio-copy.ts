export type CopySection = "summary"|"positions"|"performance"|"allocation"|"dividends"|"trades"|"cash"|"crypto";

export type PortfolioCopySettings = Record<CopySection,boolean>;

export const portfolioCopyOptions:{key:CopySection;label:string;description:string}[]=[
  {key:"summary",label:"Podsumowanie",description:"Wartość, koszt, zyski, dywidendy i liczba pozycji"},
  {key:"positions",label:"Aktywne pozycje",description:"Ilość, cena, wartość, koszt, wynik i udział każdej pozycji"},
  {key:"performance",label:"Wyniki miesięczne",description:"Wynik w kwocie oraz stopa portfela i benchmarku"},
  {key:"allocation",label:"Alokacja",description:"Rozkład według spółki, sektora i klasy aktywa"},
  {key:"dividends",label:"Dywidendy",description:"Zaksięgowane wypłaty, podatki i prognoza 12 miesięcy"},
  {key:"trades",label:"Zamknięte transakcje",description:"Daty, wolumen, ceny, przychód, koszt i wynik"},
  {key:"cash",label:"Operacje gotówkowe",description:"Wpłaty, wypłaty, prowizje i pozostałe przepływy"},
  {key:"crypto",label:"Transakcje krypto",description:"Kupno, sprzedaż, zamiany, opłaty i kursy NBP"},
];

export const defaultPortfolioCopySettings:PortfolioCopySettings={
  summary:true,positions:true,performance:true,allocation:true,
  dividends:true,trades:true,cash:true,crypto:true,
};

type CopyPosition={symbol:string;name:string;sector:string;assetClass:string;quantity:number;cost:number;value:number;currency:string;account?:string;marketPrice?:number;priceChangePct?:number|null;priceProvider?:string;priceUpdatedAt?:string};
type CopyCashEvent={date:string;type:string;symbol:string;amount:number;account?:string;comment?:string;instrument?:string};
type CopyTrade={date:string;symbol:string;side:string;volume:number;result:number;account?:string;openDate?:string;openPrice?:number;closePrice?:number;purchaseValue?:number;saleValue?:number;commission?:number;swap?:number;rollover?:number;comment?:string};
type CopyCrypto={date:string;type:string;symbol:string;name:string;quantity:number;toSymbol?:string;toQuantity?:number;amount:number;amountPln?:number;currency:string;nbpRate:number;nbpDate?:string;fee:number;feePln?:number;account:string;note?:string};
type CopyPerformancePoint={month:string;label:string;capitalGain:number;portfolioPct:number;benchmarkPct:number;investedCapital:number};
type CopyForecast={date:string;symbol:string;gross:number;net:number;confidence:string};

export type PortfolioCopyInput={
  source:string;
  account:string;
  displayCurrency:"PLN"|"USD"|"EUR"|"GBP";
  displayRate:number;
  generatedAt:Date;
  priceUpdatedAt:string|null;
  positions:CopyPosition[];
  cash:CopyCashEvent[];
  trades:CopyTrade[];
  crypto:CopyCrypto[];
  performance:CopyPerformancePoint[];
  benchmarkName:string;
  forecast:CopyForecast[];
};

const decimal=(value:number,digits=2)=>new Intl.NumberFormat("pl-PL",{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
const percent=(value:number,digits=2)=>`${value>=0?"+":""}${decimal(value,digits)}%`;
const safe=(value:unknown)=>String(value??"—").replace(/\r?\n/g," ").replace(/\|/g,"\\|").trim()||"—";
const row=(values:unknown[])=>`| ${values.map(safe).join(" | ")} |`;
const table=(headers:string[],rows:unknown[][])=>[row(headers),row(headers.map(()=>"---")),...rows.map(row)].join("\n");

function group(items:CopyPosition[],key:(item:CopyPosition)=>string){
  const values=new Map<string,number>();
  for(const item of items)values.set(key(item),(values.get(key(item))||0)+item.value);
  return[...values.entries()].sort((a,b)=>b[1]-a[1]);
}

export function buildPortfolioCopy(input:PortfolioCopyInput,settings:PortfolioCopySettings){
  const rate=input.displayRate||1;
  const money=(value:number,digits=2)=>new Intl.NumberFormat("pl-PL",{style:"currency",currency:input.displayCurrency,maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value/rate);
  const positions=input.positions;
  const totalValue=positions.reduce((sum,item)=>sum+item.value,0);
  const totalCost=positions.reduce((sum,item)=>sum+item.cost,0);
  const openProfit=totalValue-totalCost;
  const realized=input.trades.reduce((sum,item)=>sum+item.result,0);
  const dividends=input.cash.filter(item=>/divident|dividend|dywidend/i.test(item.type));
  const withholding=input.cash.filter(item=>/withholding|podatek.*zrodl/i.test(item.type.normalize("NFD").replace(/[\u0300-\u036f]/g,"")));
  const divGross=dividends.reduce((sum,item)=>sum+item.amount,0);
  const divNet=divGross+withholding.reduce((sum,item)=>sum+item.amount,0);
  const forecastTotal=input.forecast.reduce((sum,item)=>sum+item.net,0);
  const lines=[
    "# LekkiPortfel — dane portfela",
    `Wygenerowano: ${new Intl.DateTimeFormat("pl-PL",{dateStyle:"long",timeStyle:"short"}).format(input.generatedAt)}`,
    `Źródło danych: ${input.source}`,
    `Zakres rachunków: ${input.account}`,
    `Waluta prezentacji: ${input.displayCurrency}`,
    `Ostatnia aktualizacja cen: ${input.priceUpdatedAt?new Intl.DateTimeFormat("pl-PL",{dateStyle:"short",timeStyle:"short"}).format(new Date(input.priceUpdatedAt)):"brak"}`,
  ];

  if(settings.summary){
    lines.push("","## Podsumowanie",
      `- Wartość portfela: ${money(totalValue)}`,
      `- Łączny koszt: ${money(totalCost)}`,
      `- Wynik niezrealizowany: ${money(openProfit)} (${totalCost?percent(openProfit/totalCost*100):"0,00%"})`,
      `- Wynik zrealizowany: ${money(realized)}`,
      `- Dywidendy brutto: ${money(divGross)}`,
      `- Dywidendy netto: ${money(divNet)}`,
      `- Podatek u źródła: ${money(Math.abs(divGross-divNet))}`,
      `- Prognoza dywidend na 12 miesięcy: ${money(forecastTotal)} (${input.forecast.length} wypłat)`,
      `- Liczba aktywnych pozycji: ${positions.length}`,
    );
  }

  if(settings.positions){
    lines.push("","## Aktywne pozycje");
    lines.push(positions.length?table(
      ["Symbol","Nazwa","Rachunek","Klasa","Sektor","Ilość","Cena","24h","Wartość","Koszt","Wynik","Wynik %","Udział"],
      positions.map(item=>{
        const profit=item.value-item.cost;
        return[item.symbol,item.name,item.account||"PLN",item.assetClass,item.sector,decimal(item.quantity,6),item.marketPrice==null?"—":money(item.marketPrice,item.marketPrice<10?3:2),item.priceChangePct==null?"—":percent(item.priceChangePct),money(item.value),money(item.cost),money(profit),item.cost?percent(profit/item.cost*100):"—",totalValue?`${decimal(item.value/totalValue*100,2)}%`:"0,00%"];
      }),
    ):"Brak aktywnych pozycji.");
  }

  if(settings.performance){
    lines.push("",`## Wyniki miesięczne vs ${input.benchmarkName}`);
    lines.push(input.performance.length?table(
      ["Miesiąc","Wynik","Portfel","Benchmark","Zaangażowany kapitał"],
      input.performance.map(item=>[item.label,money(item.capitalGain),percent(item.portfolioPct),percent(item.benchmarkPct),money(item.investedCapital)]),
    ):"Brak danych do obliczenia historii wyników.");
  }

  if(settings.allocation){
    lines.push("","## Alokacja");
    const sections:[string,Array<[string,number]>][]=[
      ["Według spółki",group(positions,item=>item.symbol)],
      ["Według sektora",group(positions,item=>item.sector)],
      ["Według klasy aktywa",group(positions,item=>item.assetClass)],
    ];
    for(const [label,items] of sections){
      lines.push("",`### ${label}`,items.length?table(["Pozycja","Wartość","Udział"],items.map(([name,value])=>[name,money(value),totalValue?`${decimal(value/totalValue*100,2)}%`:"0,00%"])):"Brak danych.");
    }
  }

  if(settings.dividends){
    lines.push("","## Dywidendy zaksięgowane");
    lines.push(dividends.length?table(
      ["Data","Symbol","Kwota","Rachunek","Opis"],
      [...dividends].sort((a,b)=>b.date.localeCompare(a.date)).map(item=>[item.date,item.symbol||item.instrument||"Dywidenda",money(item.amount),item.account||"PLN",item.comment||item.type]),
    ):"Brak zaksięgowanych dywidend.");
    lines.push("","## Prognoza dywidend");
    lines.push(input.forecast.length?table(
      ["Data","Symbol","Brutto","Netto","Pewność"],
      input.forecast.map(item=>[item.date,item.symbol,money(item.gross),money(item.net),item.confidence]),
    ):"Brak prognozy.");
  }

  if(settings.trades){
    lines.push("","## Zamknięte transakcje");
    lines.push(input.trades.length?table(
      ["Data otwarcia","Data zamknięcia","Symbol","Strona","Wolumen","Cena otwarcia","Cena zamknięcia","Koszt","Przychód","Prowizja","Swap","Rollover","Wynik","Rachunek"],
      [...input.trades].sort((a,b)=>b.date.localeCompare(a.date)).map(item=>[item.openDate||"—",item.date,item.symbol,item.side,decimal(item.volume,6),item.openPrice==null?"—":decimal(item.openPrice,6),item.closePrice==null?"—":decimal(item.closePrice,6),item.purchaseValue==null?"—":money(item.purchaseValue),item.saleValue==null?"—":money(item.saleValue),item.commission==null?"—":money(item.commission),item.swap==null?"—":money(item.swap),item.rollover==null?"—":money(item.rollover),money(item.result),item.account||"PLN"]),
    ):"Brak zamkniętych transakcji.");
  }

  if(settings.cash){
    lines.push("","## Operacje gotówkowe");
    lines.push(input.cash.length?table(
      ["Data","Typ","Symbol","Kwota","Rachunek","Opis"],
      [...input.cash].sort((a,b)=>b.date.localeCompare(a.date)).map(item=>[item.date,item.type,item.symbol||item.instrument||"—",money(item.amount),item.account||"PLN",item.comment||"—"]),
    ):"Brak operacji gotówkowych.");
  }

  if(settings.crypto){
    lines.push("","## Transakcje krypto");
    lines.push(input.crypto.length?table(
      ["Data","Typ","Aktywo","Ilość","Otrzymano","Kwota","Kwota PLN","Prowizja PLN","Kurs NBP","Rachunek","Notatka"],
      [...input.crypto].sort((a,b)=>b.date.localeCompare(a.date)).map(item=>[item.date,item.type,item.symbol,decimal(item.quantity,8),item.toSymbol?`${decimal(item.toQuantity||0,8)} ${item.toSymbol}`:"—",`${decimal(item.amount,2)} ${item.currency}`,item.amountPln==null?"—":`${decimal(item.amountPln,2)} PLN`,item.feePln==null?"—":`${decimal(item.feePln,2)} PLN`,item.currency==="PLN"?"PLN":`${decimal(item.nbpRate,4)} (${item.nbpDate||"brak daty"})`,item.account,item.note||"—"]),
    ):"Brak transakcji krypto.");
  }

  lines.push("","---","Dane mają charakter informacyjny. Notowania mogą być opóźnione.");
  return lines.join("\n");
}
