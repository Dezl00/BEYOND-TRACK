import type { Locale } from "./types";
const units: [string[], string, string][] = [
  [["متر","م"],"Metre","m"], [["متر مربع","م²","م2"],"Square metre","m²"], [["متر مكعب","م³","م3"],"Cubic metre","m³"],
  [["كيلوجرام","كيلوغرام","كجم","كغ"],"Kilogram","kg"], [["طن"],"Tonne","t"], [["قطعة","حبة"],"Piece","pc"], [["مقطوعية"],"Lump sum","LS"], [["لتر"],"Litre","L"],
  [["عبوة"],"Pack","pack"], [["كيس"],"Bag","bag"], [["لفة"],"Roll","roll"], [["لوح"],"Sheet","sheet"], [["صندوق"],"Box","box"], [["زوج"],"Pair","pair"], [["طقم"],"Set","set"], [["عدد"],"Each","ea"], [["متر طولي","م.ط"],"Linear metre","lm"], [["ساعة"],"Hour","h"], [["يوم"],"Day","d"], [["ملليمتر","مم"],"Millimetre","mm"], [["سنتيمتر","سم"],"Centimetre","cm"]
];
export function unitLabel(value: unknown, locale: Locale, symbol = false) {
  const raw = String(value ?? "");
  const match = units.find(([names, en, short]) => names.includes(raw.trim()) || [en.toLowerCase(),short.toLowerCase()].includes(raw.trim().toLowerCase()));
  if (!match) return raw;
  if (locale === "en") return symbol ? match[2] : match[1];
  return match[0].includes(raw.trim()) ? raw : (symbol ? match[0][1] ?? match[0][0] : match[0][0]);
}

export function unitSearchAliases(query:string){const term=query.trim().toLowerCase();return term ? units.filter(([,name,symbol])=>name.toLowerCase().includes(term)||symbol.toLowerCase().includes(term)).flatMap(([names])=>names):[];}
