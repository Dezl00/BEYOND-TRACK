import { cookies } from "next/headers";
import { z } from "zod";
import { currentActor } from "@/server/auth";
import { csrf } from "@/server/security";
import { errorResponse } from "@/server/errors";
import { db,sql } from "@/db";
export async function POST(req:Request){try{
 csrf(req);
 const data=z.object({locale:z.enum(["ar","en"]).optional(),theme:z.enum(["dark","light"]).optional()}).strict().refine(v=>v.locale||v.theme).parse(await req.json());
 const actor=await currentActor(), jar=await cookies();
 if(actor){await db().execute(sql`UPDATE users SET locale=COALESCE(${data.locale??null},locale),theme=COALESCE(${data.theme===undefined?null:data.theme==="dark"?1:0}::smallint,theme) WHERE id=${actor.id}`);}
 const opts={httpOnly:true,sameSite:"lax" as const,path:"/",secure:process.env.NODE_ENV==="production",maxAge:31536000};
 if(data.locale)jar.set("bt-locale",data.locale,opts);
 if(data.theme)jar.set("bt-theme",data.theme==="dark"?"1":"0",opts);
 return Response.json({saved:true});
 }catch(e){return errorResponse(e,req)}}
