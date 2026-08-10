export type VerifiedFirebaseUser={uid:string;email?:string};

export class FirebaseAuthError extends Error{
  status:number;
  constructor(message:string,status=401){super(message);this.status=status}
}

export async function requireFirebaseUser(request:Request):Promise<VerifiedFirebaseUser>{
  const authorization=request.headers.get("authorization")||"";
  const token=authorization.startsWith("Bearer ")?authorization.slice(7).trim():"";
  if(!token)throw new FirebaseAuthError("Zaloguj się ponownie.");
  const apiKey=process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if(!apiKey)throw new FirebaseAuthError("Brak konfiguracji Firebase na serwerze.",503);
  const response=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,{
    method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({idToken:token}),
  });
  if(!response.ok)throw new FirebaseAuthError("Sesja wygasła. Zaloguj się ponownie.");
  const result=await response.json() as {users?:Array<{localId?:string;email?:string;disabled?:boolean}>};
  const user=result.users?.[0];
  if(!user?.localId||user.disabled)throw new FirebaseAuthError("Konto nie jest dostępne.");
  return{uid:user.localId,email:user.email};
}
