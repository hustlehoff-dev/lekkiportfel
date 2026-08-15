/* eslint-disable @next/next/no-img-element */
import { assetInitials } from "../../lib/asset-icons";

export function AssetIcon({symbol,name,assetClass,image,className=""}:{symbol:string;name?:string;assetClass:string;image?:string;className?:string}){
  const params=new URLSearchParams({symbol,assetClass});
  if(image)params.set("image",image);
  return <span className={`asset-icon ${className}`.trim()} title={`${name||symbol} - ${symbol}`} aria-hidden="true"><b>{assetInitials(symbol)}</b><img src={`/api/asset-icon?${params}`} alt="" loading="lazy" decoding="async" onError={event=>{event.currentTarget.hidden=true}}/></span>;
}
