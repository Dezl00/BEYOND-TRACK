import {language} from "@/messages/catalog";
import type {Locale} from "@/messages/types";
import type { MetadataRoute } from "next";
import { ar } from "@/messages/ar";
export function appManifest(locale:Locale="ar"): MetadataRoute.Manifest {
  const {m:ar,dir}=language(locale);
  return {
    id: "/",
    name: ar.brand,
    short_name: ar.brand,
    description: ar.app,
    lang:locale,
    dir,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/pwa-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
