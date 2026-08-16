import { classifyAssetClass } from "../lib/asset-class";
import { ALL_PROVIDERS, type PortfolioData, type Sector } from "./portfolio-types";

export function normalizePortfolioAssetClasses(portfolio:PortfolioData){
  let changed=false;
  const positions=portfolio.positions.map(position=>{
    const assetClass=classifyAssetClass(position.symbol,position.assetClass);
    if(assetClass===position.assetClass)return position;
    changed=true;
    return{...position,assetClass};
  });
  return{portfolio:changed?{...portfolio,positions}:portfolio,changed};
}

export const number=(value:number,digits=2)=>new Intl.NumberFormat("pl-PL",{maximumFractionDigits:digits,minimumFractionDigits:digits}).format(value);
export const plural=(value:number,one:string,few:string,many:string)=>value===1?one:([2,3,4].includes(value%10)&&![12,13,14].includes(value%100)?few:many);
export const dateLabel=(value:string)=>new Intl.DateTimeFormat("pl-PL",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value));
export const norm=(value:unknown)=>String(value??"").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
export const num=(value:unknown)=>{if(typeof value==="number")return value;const clean=String(value??"").replace(/\s/g,"").replace(/[^0-9,.-]/g,"");const normalized=clean.includes(",")&&!clean.includes(".")?clean.replace(",", "."):clean.replace(/,/g,"");return Number(normalized)||0};

export function clientId(prefix:string){
  const webCrypto=globalThis.crypto;
  if(typeof webCrypto?.randomUUID==="function")return`${prefix}-${webCrypto.randomUUID()}`;
  if(typeof webCrypto?.getRandomValues==="function"){
    const bytes=new Uint8Array(16);webCrypto.getRandomValues(bytes);
    return`${prefix}-${Array.from(bytes,byte=>byte.toString(16).padStart(2,"0")).join("")}`;
  }
  return`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export async function copyText(text:string){
  if(window.isSecureContext&&navigator.clipboard?.writeText){
    try{await navigator.clipboard.writeText(text);return}catch{}
  }
  const area=document.createElement("textarea");
  area.value=text;area.setAttribute("readonly","");area.style.position="fixed";area.style.left="-9999px";area.style.opacity="0";
  document.body.appendChild(area);area.select();area.setSelectionRange(0,text.length);
  const copied=document.execCommand("copy");area.remove();
  if(!copied)throw new Error("Przeglądarka zablokowała dostęp do schowka");
}

export const sectorFromSearch=(value?:string):Sector=>{const sector=norm(value);if(/tech|communication/.test(sector))return"Technologia";if(/financial/.test(sector))return"Finanse";if(/health/.test(sector))return"Zdrowie";if(/consumer/.test(sector))return"Konsumpcja";if(/industrial|materials/.test(sector))return"Przemysł";if(/energy|utilities/.test(sector))return"Energia";if(/real estate/.test(sector))return"Nieruchomości";return"Inne"};
export const providerName=(item:{account?:string;provider?:string;manual?:boolean})=>{const provider=String(item.provider||"").trim();if(provider)return provider;const account=String(item.account||"").trim();if(/^(PLN|IKE|IKZE)$/i.test(account))return"XTB";if(account&&!/^Poza XTB$/i.test(account))return account;return item.manual?"Własne":"XTB"};
export const matchesProvider=(item:{account?:string;provider?:string;manual?:boolean},provider:string)=>provider===ALL_PROVIDERS||providerName(item)===provider;
