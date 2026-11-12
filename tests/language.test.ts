import { describe,expect,it } from "vitest";
import { language } from "@/messages/catalog";
import { ar } from "@/messages/ar";
import { en } from "@/messages/en";
import { requestEmail, otpEmail } from "@/server/email-templates";
import { importTemplate,parseImport } from "@/server/import";
import { GET as offline } from "@/app/offline/route";
describe("English presentation",()=>{
 it("covers every catalog entry including indexed statuses and workflow labels",()=>{
  function check(a: unknown,b: unknown){if(typeof a==="string"){expect(typeof b).toBe("string");if(a)expect(b).not.toBe("");return}expect(Object.keys(b as object)).toEqual(Object.keys(a as object));for(const key of Object.keys(a as object))check((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]);}
  check(ar,en);
 });
 it("formats dates, quantities and all deployed units without translating names",()=>{
  const english=language("en");expect(english.date("2026-11-12")).toContain("Nov");expect(english.number("3.5",1)).toBe("3.5");
  expect(["طن","عبوة","قطعة","كيس","كيلوجرام","لتر","لفة","لوح","متر","متر مربع","متر مكعب","مقطوعية"].map(v=>english.unit(v))).toEqual(["Tonne","Pack","Piece","Bag","Kilogram","Litre","Roll","Sheet","Metre","Square metre","Cubic metre","Lump sum"]);
  expect(english.unit("م³",true)).toBe("m³");expect(english.unit("Custom unit")).toBe("Custom unit");
 });
 it("renders English recipient mail while preserving free text and escaping names",()=>{
  const html=requestEmail({number:"KS-001",status:12,project:"مشروع ألف",creator:"أحمد",created_at:"2026-11-12",supplier:null,expected_at:null,notes:"الموقع الشرقي"},[{code:"A",name:"مادة <X>",unit:"متر مكعب",quantity:"2",price:null,notes:"",accepted:"0",damaged:"0",returned:"0",rejected:"0"}],"New request","https://example.com",false,"en");
  for(const value of ['lang="en" dir="ltr"',"مشروع ألف","الموقع الشرقي","مادة &lt;X&gt;","Cubic metre","Requested by","Awaiting Construction Manager approval"])expect(html).toContain(value);
  expect(html).not.toContain('dir="rtl"'); expect(otpEmail("Sign-in code","123456","en")).toContain("Valid for five minutes");
 });
 it("reads the English import template and serves an English offline page",async()=>{
  const file=await importTemplate("en");expect((await parseImport(new File([new Uint8Array(file)],"template.xlsx")))[0]).toContain("Cubic metre");
  expect(await offline(new Request("https://example.com/offline?lang=en")).text()).toContain('lang="en" dir="ltr"');
 });
});
