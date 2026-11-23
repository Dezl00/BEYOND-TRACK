import { z } from "zod";
import { db, one, sql } from "@/db";
import { requireActor } from "@/server/auth";
import { csrf,rateLimit } from "@/server/security";
import { AppError,errorResponse } from "@/server/errors";

export async function POST(req:Request) {
  try {
    csrf(req);
    const a=await requireActor();
    await rateLimit("android-push",a.id,20,60);
    const {token,remove}=z.object({token:z.string().min(20).max(4096).regex(/^[A-Za-z0-9_:.\-]+$/),remove:z.boolean().default(false)}).parse(await req.json());
    const endpoint="android:"+token;
    if(remove) {
      await db().execute(sql`DELETE FROM push_subscriptions WHERE endpoint=${endpoint} AND user_id=${a.id} AND auth=${a.session_id}`);
    } else {
      if(!process.env.FIREBASE_SERVICE_ACCOUNT_JSON) throw new AppError("configured",503);
      const count=await one<{n:number}>(sql`SELECT count(*)::int n FROM push_subscriptions WHERE user_id=${a.id} AND endpoint<>${endpoint} AND auth<>${a.session_id}`);
      if((count?.n??0)>=10)throw new AppError("rate",429);
      await db().transaction(async tx=>{
        await tx.execute(sql`DELETE FROM push_subscriptions WHERE user_id=${a.id} AND auth=${a.session_id} AND endpoint<>${endpoint}`);
        await tx.execute(sql`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES (${a.id},${endpoint},'',${a.session_id}) ON CONFLICT(endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,auth=EXCLUDED.auth`);
      });
    }
    return Response.json({saved:true});
  }catch(e){return errorResponse(e,req);}
}
