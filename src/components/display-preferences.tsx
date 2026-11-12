"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Languages, Moon, Sun } from "lucide-react";
import { LocaleContext, useLanguage } from "./language-context";
import { language } from "@/messages/catalog";
import type { Locale } from "@/messages/types";
type Theme = "light" | "dark";
type Display = { locale: Locale; theme: Theme };
const DisplayContext = createContext({theme:"light" as Theme, busy:false, error:"", change: (_patch: Partial<Display>)=>{}});
export function DisplayProvider({initial,children}:{initial:Display;children:React.ReactNode}){
 const router=useRouter(),[display,setDisplay]=useState(initial),[busy,setBusy]=useState(false),[error,setError]=useState(""),pending=useRef(false);
 function apply(value:Display){ const root=document.documentElement;root.lang=value.locale;root.dir=value.locale==="en"?"ltr":"rtl";root.dataset.theme=value.theme;setDisplay(value); }
 useEffect(()=>{apply(initial)},[initial.locale,initial.theme]);
 async function change(patch:Partial<Display>){if(pending.current)return;pending.current=true;setBusy(true);setError("");const next={...display,...patch};apply(next);
 try{const res=await fetch("/api/auth/display",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(patch)});if(!res.ok)throw Error();router.refresh();}
 catch{apply(display);setError(language(display.locale).m.common.failed)}
 finally{pending.current=false;setBusy(false)}}
 return <LocaleContext.Provider value={display.locale}><DisplayContext.Provider value={{theme:display.theme,busy,error,change}}>{children}</DisplayContext.Provider></LocaleContext.Provider>;
}
export function DisplayTools(){
 const {locale,m}=useLanguage(),{theme,change,busy,error}=useContext(DisplayContext);
 const dark=theme==="dark",themeLabel=dark?m.interface.switchLight:m.interface.switchDark;
 return <div className="display-tools"><button type="button" className="display-icon" title={m.interface.switchLanguage} aria-label={m.interface.switchLanguage} disabled={busy} onClick={()=>change({locale:locale==="en"?"ar":"en"})}><Languages size={17} strokeWidth={1.65}/></button><button type="button" className="display-icon" title={themeLabel} aria-label={themeLabel} disabled={busy} onClick={()=>change({theme:dark?"light":"dark"})}>{dark?<Sun size={17}/>:<Moon size={17}/>}</button>{error?<small role="alert">{error}</small>:null}</div>;
}
export function DisplayPreferences(){
 const {locale,m}=useLanguage(),{theme,change,busy}=useContext(DisplayContext);
 return <section className="settings-display"><h2>{m.interface.display}</h2>
 <fieldset><legend>{m.interface.language}</legend><div className="language-choices">{(["ar","en"] as const).map(key=><button type="button" disabled={busy} key={key} lang={key} aria-pressed={locale===key} onClick={()=>change({locale:key})}><span>{key==="en"?"English":"العربية"}</span>{locale===key?<Check size={16}/>:null}</button>)}</div></fieldset>
 <fieldset><legend>{m.interface.theme}</legend><div className="theme-choices">{(["light","dark"] as const).map(key=><button type="button" key={key} disabled={busy} aria-pressed={theme===key} onClick={()=>change({theme:key})}><span className={"theme-preview preview-"+key} aria-hidden="true"><i/><b/><em/></span><span className="theme-caption">{key==="light"?<Sun size={16}/>:<Moon size={16}/>} {m.settings[key]} {theme===key?<Check size={15}/>:null}</span></button>)}</div></fieldset></section>;
}
