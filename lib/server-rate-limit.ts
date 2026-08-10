type RateWindow={started:number;count:number};

const windows=new Map<string,RateWindow>();

export function enforceRateLimit(scope:string,userId:string,limit:number,windowMs=60*60_000){
  const key=`${scope}:${userId}`;
  const now=Date.now();
  const current=windows.get(key);
  if(!current||now-current.started>windowMs){windows.set(key,{started:now,count:1});return}
  if(current.count>=limit)throw new Error("RATE_LIMIT");
  current.count+=1;
}
