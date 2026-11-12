import {appManifest} from "@/lib/pwa-manifest";
export const dynamic="force-static";
export function GET(){return Response.json(appManifest("en"),{headers:{"Content-Type":"application/manifest+json"}})}
