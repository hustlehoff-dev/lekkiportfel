import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { browserLocalPersistence, browserSessionPersistence, createUserWithEmailAndPassword, getAuth, GoogleAuthProvider, onAuthStateChanged, sendEmailVerification, sendPasswordResetEmail, setPersistence, signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut, type User } from "firebase/auth";
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { CURRENT_PORTFOLIO_SCHEMA_VERSION, getPortfolioSchemaVersion, migratePortfolioData } from "./portfolio-schema";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);

function firebaseApp():FirebaseApp {
  if(!firebaseConfigured)throw new Error("Firebase nie jest jeszcze skonfigurowany.");
  return getApps().length?getApp():initializeApp(config);
}

export function observeUser(callback:(user:User|null)=>void) {
  return onAuthStateChanged(getAuth(firebaseApp()),callback);
}

export async function registerWithPassword(email:string,password:string) {
  const auth=getAuth(firebaseApp());
  await setPersistence(auth,browserSessionPersistence);
  const credential=await createUserWithEmailAndPassword(auth,email,password);
  await sendEmailVerification(credential.user);
  await signOut(auth);
}

export async function loginWithPassword(email:string,password:string,remember:boolean) {
  const auth=getAuth(firebaseApp());
  await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence);
  const credential=await signInWithEmailAndPassword(auth,email,password);
  if(!credential.user.emailVerified){await sendEmailVerification(credential.user);await signOut(auth);throw new Error("Najpierw potwierdź adres e-mail. Wysłaliśmy nowy link aktywacyjny.")}
  return credential.user;
}

export async function loginWithGoogle(remember:boolean) {
  const auth=getAuth(firebaseApp());
  await setPersistence(auth,remember?browserLocalPersistence:browserSessionPersistence);
  const provider=new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  const hostname=window.location.hostname;
  const localNetwork=/^(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname);
  if(localNetwork){await signInWithRedirect(auth,provider);return}
  const credential=await signInWithPopup(auth,provider);
  if(!credential.user.emailVerified){await signOut(auth);throw new Error("Konto Google nie ma potwierdzonego adresu e-mail.")}
  return credential.user;
}

export async function resetPassword(email:string) {
  await sendPasswordResetEmail(getAuth(firebaseApp()),email);
}

export async function logout() {
  await signOut(getAuth(firebaseApp()));
}

export async function loadUserPortfolio<T>(uid:string) {
  const reference=doc(getFirestore(firebaseApp()),"users",uid,"portfolio","main");
  const snapshot=await getDoc(reference);
  if(!snapshot.exists())return null;
  const stored=snapshot.data().portfolio;
  const storedVersion=getPortfolioSchemaVersion(stored);
  const portfolio=migratePortfolioData(stored);
  if(storedVersion!==CURRENT_PORTFOLIO_SCHEMA_VERSION){
    try{await setDoc(reference,{portfolio,schemaVersion:CURRENT_PORTFOLIO_SCHEMA_VERSION,updatedAt:serverTimestamp()},{merge:true})}catch{}
  }
  return portfolio as T;
}

export async function saveUserPortfolio(uid:string,portfolio:unknown) {
  const sanitized=JSON.parse(JSON.stringify(portfolio));
  const migrated=migratePortfolioData(sanitized);
  await setDoc(doc(getFirestore(firebaseApp()),"users",uid,"portfolio","main"),{portfolio:migrated,schemaVersion:CURRENT_PORTFOLIO_SCHEMA_VERSION,updatedAt:serverTimestamp()});
  return true;
}

export type FirebaseUser = User;
