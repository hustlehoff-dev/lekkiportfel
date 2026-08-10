import { portfolioExtractionPrompt, portfolioProposalSchema, validatePortfolioProposal } from "../../../../lib/ai-portfolio";
import { FirebaseAuthError, requireFirebaseUser } from "../../../../lib/firebase-server-auth";
import { enforceRateLimit } from "../../../../lib/server-rate-limit";

export async function POST(request:Request){
  try{
    const user=await requireFirebaseUser(request);
    try{enforceRateLimit("portfolio",user.uid,30)}catch{throw new FirebaseAuthError("Osiągnięto godzinowy limit analiz. Spróbuj później.",429)}
    const apiKey=process.env.XAI_API_KEY;
    if(!apiKey)return Response.json({error:"Dodaj XAI_API_KEY do pliku .env.local i uruchom aplikację ponownie."},{status:503});
    const contentLength=Number(request.headers.get("content-length")||0);
    if(contentLength>15*1024*1024)return Response.json({error:"Żądanie jest zbyt duże."},{status:413});
    const body=await request.json() as {prompt?:unknown;imageDataUrl?:unknown};
    const prompt=typeof body.prompt==="string"?body.prompt.trim().slice(0,5000):"";
    const imageDataUrl=typeof body.imageDataUrl==="string"?body.imageDataUrl:"";
    if(!prompt&&!imageDataUrl)return Response.json({error:"Wpisz polecenie albo dodaj screenshot."},{status:400});
    if(imageDataUrl&&!/^data:image\/(png|jpeg);base64,/i.test(imageDataUrl))return Response.json({error:"Obsługiwane są screenshoty PNG i JPEG."},{status:400});
    if(imageDataUrl.length>14_000_000)return Response.json({error:"Screenshot jest zbyt duży. Maksymalnie około 10 MB."},{status:413});

    const content:Array<Record<string,unknown>>=[];
    if(imageDataUrl)content.push({type:"input_image",image_url:imageDataUrl,detail:"high"});
    content.push({type:"input_text",text:prompt||"Odczytaj ze screenshota bieżące aktywa, ilości, gotówkę, rachunki i widoczne wartości."});
    const response=await fetch("https://api.x.ai/v1/responses",{
      method:"POST",
      headers:{authorization:`Bearer ${apiKey}`,"content-type":"application/json"},
      body:JSON.stringify({
        model:process.env.XAI_MODEL||"grok-4.3",
        instructions:portfolioExtractionPrompt,
        input:[{role:"user",content}],
        text:{format:{type:"json_schema",name:"portfolio_proposal",schema:portfolioProposalSchema,strict:true}},
        store:false,
      }),
    });
    const result=await response.json() as {error?:{message?:string};output?:Array<{type?:string;content?:Array<{type?:string;text?:string}>}>};
    if(!response.ok)throw new FirebaseAuthError(result.error?.message||`xAI zwróciło błąd ${response.status}.`,response.status>=400&&response.status<500?response.status:502);
    const output=result.output?.find(item=>item.type==="message")?.content?.find(item=>item.type==="output_text")?.text;
    if(!output)throw new FirebaseAuthError("Model nie zwrócił danych do podglądu.",502);
    const proposal=validatePortfolioProposal(JSON.parse(output));
    return Response.json({...proposal,zeroDataRetention:response.headers.get("x-zero-data-retention")==="true"},{headers:{"cache-control":"no-store"}});
  }catch(error){
    const status=error instanceof FirebaseAuthError?error.status:500;
    return Response.json({error:error instanceof Error?error.message:"Nie udało się przeanalizować danych."},{status,headers:{"cache-control":"no-store"}});
  }
}
