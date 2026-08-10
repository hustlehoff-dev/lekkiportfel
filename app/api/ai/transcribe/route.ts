import { FirebaseAuthError, requireFirebaseUser } from "../../../../lib/firebase-server-auth";
import { enforceRateLimit } from "../../../../lib/server-rate-limit";

export async function POST(request:Request){
  try{
    const user=await requireFirebaseUser(request);
    try{enforceRateLimit("transcription",user.uid,20)}catch{throw new FirebaseAuthError("Osiągnięto godzinowy limit nagrań. Spróbuj później.",429)}
    const apiKey=process.env.XAI_API_KEY;
    if(!apiKey)return Response.json({error:"Dodaj XAI_API_KEY do pliku .env.local i uruchom aplikację ponownie."},{status:503});
    const contentLength=Number(request.headers.get("content-length")||0);
    if(contentLength>22*1024*1024)return Response.json({error:"Nagranie jest zbyt duże. Maksymalnie 20 MB."},{status:413});
    const incoming=await request.formData();const file=incoming.get("file");
    if(!(file instanceof File)||!file.size)return Response.json({error:"Nie otrzymano nagrania."},{status:400});
    if(file.size>20*1024*1024)return Response.json({error:"Nagranie jest zbyt duże. Maksymalnie 20 MB."},{status:413});
    if(file.type&&!/^audio\//i.test(file.type))return Response.json({error:"Wybierz plik audio."},{status:400});
    const form=new FormData();
    form.append("format","true");form.append("language","pl");
    for(const term of ["XTB","ETF","USDT","USDC","Bitcoin","Ethereum","złoty"])form.append("keyterm",term);
    form.append("file",file,file.name||"nagranie.webm");
    const response=await fetch("https://api.x.ai/v1/stt",{method:"POST",headers:{authorization:`Bearer ${apiKey}`},body:form});
    const result=await response.json() as {text?:string;duration?:number;error?:{message?:string}};
    if(!response.ok)throw new FirebaseAuthError(result.error?.message||`Transkrypcja zwróciła błąd ${response.status}.`,response.status>=400&&response.status<500?response.status:502);
    if(!result.text?.trim())throw new FirebaseAuthError("Nie rozpoznano mowy w nagraniu.",422);
    return Response.json({text:result.text.trim(),duration:result.duration||0,zeroDataRetention:response.headers.get("x-zero-data-retention")==="true"},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const status=error instanceof FirebaseAuthError?error.status:500;
    return Response.json({error:error instanceof Error?error.message:"Nie udało się przepisać nagrania."},{status,headers:{"cache-control":"no-store"}});
  }
}
