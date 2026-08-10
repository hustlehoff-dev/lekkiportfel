export type AiPortfolioItem={
  kind:"cash"|"stock"|"etf"|"crypto"|"other";
  symbol:string|null;
  name:string|null;
  quantity:number|null;
  currency:"PLN"|"EUR"|"USD"|"GBP"|"CHF"|"DKK"|"SEK"|"NOK"|null;
  amount:number|null;
  totalCostPln:number|null;
  currentValuePln:number|null;
  account:string|null;
  confidence:"high"|"medium"|"low";
  notes:string|null;
};

export type AiPortfolioProposal={summary:string;items:AiPortfolioItem[];warnings:string[];zeroDataRetention?:boolean};

const nullableString={type:["string","null"]};
const nullableNumber={type:["number","null"]};

export const portfolioProposalSchema={
  type:"object",
  properties:{
    summary:{type:"string"},
    items:{type:"array",maxItems:50,items:{
      type:"object",
      properties:{
        kind:{type:"string",enum:["cash","stock","etf","crypto","other"]},
        symbol:nullableString,
        name:nullableString,
        quantity:nullableNumber,
        currency:{type:["string","null"],enum:["PLN","EUR","USD","GBP","CHF","DKK","SEK","NOK",null]},
        amount:nullableNumber,
        totalCostPln:nullableNumber,
        currentValuePln:nullableNumber,
        account:nullableString,
        confidence:{type:"string",enum:["high","medium","low"]},
        notes:nullableString,
      },
      required:["kind","symbol","name","quantity","currency","amount","totalCostPln","currentValuePln","account","confidence","notes"],
      additionalProperties:false,
    }},
    warnings:{type:"array",maxItems:20,items:{type:"string"}},
  },
  required:["summary","items","warnings"],
  additionalProperties:false,
} as const;

export const portfolioExtractionPrompt=`Jesteś modułem importu danych do polskiej aplikacji śledzącej majątek. Analizujesz polecenie użytkownika albo screenshot i proponujesz wyłącznie dodanie bieżących stanów aktywów.

Zasady:
- Nie udzielaj porad inwestycyjnych i nie oceniaj opłacalności aktywów.
- Nie wymyślaj symbolu, ilości, kosztu, wartości ani rachunku. Brak danych zapisuj jako null i opisz w warnings.
- Dla gotówki ustaw kind=cash, amount jako nominalną kwotę w podanej walucie i quantity=null.
- Dla akcji, ETF i krypto ustaw quantity jako liczbę jednostek. amount ma wtedy być null.
- totalCostPln oraz currentValuePln zapisuj tylko wtedy, gdy wartość w PLN wynika wprost z materiału. Nie przeliczaj kursów walut.
- Rozpoznawaj polski zapis liczb, przecinki dziesiętne, separatory tysięcy i symbole walut.
- Jedna pozycja na każdy jednoznacznie rozpoznany składnik majątku.
- Jeśli obraz zawiera tabelę, pomiń sumy, nagłówki, przyciski, dzienne zmiany i pozycje zamknięte.
- confidence=high tylko gdy rodzaj aktywa oraz jego ilość albo kwota są jednoznaczne.
- summary i warnings pisz krótko po polsku.`;

export function validatePortfolioProposal(value:unknown):AiPortfolioProposal{
  if(!value||typeof value!=="object")throw new Error("Model zwrócił nieprawidłową odpowiedź.");
  const raw=value as Partial<AiPortfolioProposal>;
  const allowedKinds=new Set(["cash","stock","etf","crypto","other"]);
  const allowedCurrencies=new Set(["PLN","EUR","USD","GBP","CHF","DKK","SEK","NOK"]);
  const cleanText=(input:unknown,max=200)=>typeof input==="string"?input.trim().slice(0,max)||null:null;
  const cleanNumber=(input:unknown)=>typeof input==="number"&&Number.isFinite(input)&&input>=0?input:null;
  const items=Array.isArray(raw.items)?raw.items.slice(0,50).flatMap((candidate):AiPortfolioItem[]=>{
    if(!candidate||typeof candidate!=="object")return[];
    const item=candidate as Partial<AiPortfolioItem>;
    if(!item.kind||!allowedKinds.has(item.kind))return[];
    const currency=item.currency&&allowedCurrencies.has(item.currency)?item.currency:null;
    const quantity=cleanNumber(item.quantity),amount=cleanNumber(item.amount);
    const totalCostPln=cleanNumber(item.totalCostPln),currentValuePln=cleanNumber(item.currentValuePln);
    const valid=item.kind==="cash"
      ? amount!==null&&amount>0
      : item.kind==="other"
        ? (quantity!==null&&quantity>0)||(totalCostPln!==null&&totalCostPln>0)||(currentValuePln!==null&&currentValuePln>0)
        : quantity!==null&&quantity>0;
    if(!valid)return[];
    return[{
      kind:item.kind,
      symbol:cleanText(item.symbol,40),
      name:cleanText(item.name),
      quantity:item.kind==="cash"?null:quantity,
      currency,
      amount:item.kind==="cash"?amount:null,
      totalCostPln,
      currentValuePln,
      account:cleanText(item.account,100),
      confidence:item.confidence==="high"||item.confidence==="medium"?item.confidence:"low",
      notes:cleanText(item.notes,500),
    }];
  }):[];
  return{
    summary:typeof raw.summary==="string"?raw.summary.slice(0,500):"Przeanalizowano dane.",
    items,
    warnings:Array.isArray(raw.warnings)?raw.warnings.filter((item):item is string=>typeof item==="string").slice(0,20).map(item=>item.slice(0,500)):[],
  };
}
