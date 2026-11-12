// @vitest-environment jsdom
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {createElement as h} from "react";
import {render,screen,fireEvent,waitFor,cleanup} from "@testing-library/react";
import {DisplayPreferences,DisplayProvider,DisplayTools} from "@/components/display-preferences";
import SettingsTab from "@/app/(app)/settings/[tab]/page";
import {language} from "@/messages/catalog";
import type { Locale } from "@/messages/types";
const state=vi.hoisted(()=>({locale:"ar" as Locale, owner:true, refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:state.refresh}),usePathname:()=>"/settings/appearance",useSearchParams:()=>new URLSearchParams(),notFound:()=>{throw Error("404")}}));
vi.mock("@/server/page-auth",()=>({requirePageActor:async()=>({id:"demo",is_owner:state.owner,permissions:[],theme:0})}));
vi.mock("@/server/language",()=>({requestLanguage:async()=>language(state.locale)}));
vi.mock("@/db",async()=>({sql:(await import("drizzle-orm")).sql,one:async()=>({}),rows:async()=>[]}));
beforeEach(()=>{state.owner=true;state.locale="ar";vi.stubGlobal("fetch",vi.fn(async()=>Response.json({saved:true})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it("uses the same language and theme controls in preferences and the header, and restores the previous state after a failed save",async()=>{
 render(h(DisplayProvider,{initial:{locale:"ar",theme:"light"},children:[h(DisplayTools,{key:"header"}),h(DisplayPreferences,{key:"settings"})]}));
 fireEvent.click(screen.getByRole("button",{name:"English"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Dark"}).hasAttribute("disabled")).toBe(false));expect(document.documentElement.dir).toBe("ltr");
 expect(screen.getByRole("heading",{name:"Display preferences"})).toBeTruthy();expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({locale:"en"});
 fireEvent.click(screen.getByRole("button",{name:"Switch to dark mode"}));await waitFor(()=>expect(screen.getByRole("button",{name:"Dark"}).getAttribute("aria-pressed")).toBe("true"));expect(document.documentElement.dataset.theme).toBe("dark");
 await waitFor(()=>expect(screen.getByRole("button",{name:"Switch to Arabic"}).hasAttribute("disabled")).toBe(false));vi.mocked(fetch).mockRejectedValueOnce(new Error());fireEvent.click(screen.getByRole("button",{name:"Switch to Arabic"}));await screen.findByRole("alert");expect(document.documentElement.lang).toBe("en");
});
it.each(["en","ar"] as const)("renders the settings rail and preference content in %s and respects role permissions",async(locale)=>{
 state.locale=locale;state.owner=false;const {m}=language(locale);
 const page=await SettingsTab({params:Promise.resolve({tab:"appearance"}),searchParams:Promise.resolve({})});
 const view=render(h(DisplayProvider,{initial:{locale,theme:"light"},children:page}));
 const nav=screen.getByRole("navigation",{name:m.nav.settings});expect(nav.querySelectorAll("a")).toHaveLength(3);
 expect(nav.querySelector('[aria-current="page"]')?.textContent).toContain(m.common.appearance);
 expect(view.container.querySelector(".settings-rail + .settings-content")).toBeTruthy();expect(screen.getByRole("heading",{name:m.interface.display})).toBeTruthy();
});
