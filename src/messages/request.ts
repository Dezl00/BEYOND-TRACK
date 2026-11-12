import { language } from "./catalog";
export function fromRequest(req?:Request){return language(/(?:^|;\s*)bt-locale=en(?:;|$)/.test(req?.headers?.get("cookie")??"")?"en":"ar");}
