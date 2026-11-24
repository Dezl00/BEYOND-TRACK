import { createPrivateKey, createSign } from "node:crypto";

let account: { raw: string; client_email: string; privateKey: ReturnType<typeof createPrivateKey> } | undefined;
function serviceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;
  if (account?.raw === raw) return account;
  try {
    const key = JSON.parse(raw);
    if (key.project_id !== "beyond-91cad" || typeof key.client_email !== "string" || !key.client_email || typeof key.private_key !== "string")
      return undefined;
    account = { raw, client_email: key.client_email, privateKey: createPrivateKey(key.private_key) };
    cached = undefined;
    return account;
  } catch { return undefined; }
}
export function androidPushConfigured() {
  return !!serviceAccount();
}

let cached: { value: string; expires: number } | undefined;
async function accessToken() {
  const key = serviceAccount();
  if (!key) throw new Error("Firebase configuration missing");
  if (cached && cached.expires > Date.now()) return cached.value;
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const url = "https://oauth2.googleapis.com/token";
  const body = encode({ alg: "RS256", typ: "JWT" }) + "." + encode({
    iss: key.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: url, iat: now, exp: now + 3600,
  });
  const signature = createSign("RSA-SHA256").update(body).sign(key.privateKey,"base64url");
  const res = await fetch(url,{method:"POST",signal:AbortSignal.timeout(8000),body:new URLSearchParams({
    grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion:body+"."+signature
  })});
  if (!res.ok) throw new Error("Firebase authentication failed");
  const data = await res.json();
  cached={value:data.access_token,expires:Date.now()+(data.expires_in-60)*1000};
  return cached.value;
}

export async function sendAndroidPush(token:string, title:string, body:string, requestId:string, notificationId:string) {
  const response=await fetch("https://fcm.googleapis.com/v1/projects/beyond-91cad/messages:send",{
    method:"POST",signal:AbortSignal.timeout(10000),
    headers:{Authorization:"Bearer "+await accessToken(),"Content-Type":"application/json"},
    body:JSON.stringify({message:{token,notification:{title,body},data:{requestId,notificationId},android:{ttl:"300s",notification:{tag:notificationId,channel_id:"track_updates_v1",sound:"track_notification"}}}})
  });
  if(response.ok)return true;
  const data=await response.json();
  if(data.error?.details?.some((detail:{errorCode?:string})=>detail.errorCode==="UNREGISTERED"))return false;
  throw new Error("Firebase delivery HTTP "+response.status);
}
