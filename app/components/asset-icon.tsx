/* eslint-disable @next/next/no-img-element */
import { assetInitials, localAssetLogoPath } from "../../lib/asset-icons";

export function AssetIcon({symbol,name,assetClass,image,className=""}:{symbol:string;name?:string;assetClass:string;image?:string;className?:string}){
  const params=new URLSearchParams({symbol,assetClass});
  if(image)params.set("image",image);
  const remoteFallback=`/api/asset-icon?${params}`;
  const localSource=localAssetLogoPath(symbol);
  return <span className={`asset-icon ${className}`.trim()} data-symbol={symbol.trim().toUpperCase()} title={`${name||symbol} - ${symbol}`} aria-hidden="true"><b>{assetInitials(symbol)}</b><img src={localSource||remoteFallback} alt="" loading="lazy" decoding="async" onError={event=>{if(localSource&&event.currentTarget.dataset.fallback!=="remote"){event.currentTarget.dataset.fallback="remote";event.currentTarget.src=remoteFallback}else event.currentTarget.hidden=true}}/></span>;
}
