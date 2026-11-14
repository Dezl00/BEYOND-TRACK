import { language } from "@/messages/catalog";
import { type Locale } from "@/messages/types";
import readWorkbook from "read-excel-file/node";
import writeExcelFile from "write-excel-file/node";
import { parse as parseCsv } from "csv-parse/sync";
import { AppError } from "./errors";
import { catalogHeaders } from "@/lib/catalog-transfer";
export { applyBoq as importBoq, previewBoq } from "./catalog-import";
function checkZip(buffer: Buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  if (eocd < 0) throw new AppError("import");
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16),
    total = 0;
  if (count > 6000 || offset >= buffer.length) throw new AppError("import");
  for (let n = 0; n < count; n++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    )
      throw new AppError("import");
    total += buffer.readUInt32LE(offset + 24);
    if (total > 12 * 1024 * 1024) throw new AppError("file");
    offset +=
      46 +
      buffer.readUInt16LE(offset + 28) +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}
export async function parseImport(file: File) {
  if (!file.size || file.size > 4 * 1024 * 1024) throw new AppError("file");
  const buffer = Buffer.from(await file.arrayBuffer());
  let sheets: unknown[][][];
  if (/\.xlsx$/i.test(file.name)) {
    checkZip(buffer);
    sheets = (await readWorkbook(buffer)).map((sheet) => sheet.data);
  } else if (/\.csv$/i.test(file.name)) {
    sheets = [
      parseCsv(buffer, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 32000,
      }),
    ];
  } else throw new AppError("import");
  const data: string[][] = [];
  for (const sheet of sheets) {
    const [headers, ...body] = sheet;
    if (!headers?.length && !body.length) continue;
    const names = headers.map((h) => String(h ?? "").trim());
    const indexes = catalogHeaders("ar").map((h, i) =>
      names.findIndex(
        (n) =>
          n === h ||
          n === catalogHeaders("en")[i] ||
          (i === 2 && n === "القسم الفرعي2"),
      ),
    );
    if (indexes.slice(0, 5).some((i) => i < 0)) throw new AppError("import");
    for (const row of body) {
      if (row.every((cell) => cell == null || cell === "")) continue;
      data.push(indexes.map((i) => (i < 0 ? "" : String(row[i] ?? "").trim())));
      if (data.length > 10000) throw new AppError("import");
    }
  }
  if (!data.length) throw new AppError("import");
  return data;
}
export async function importTemplate(locale: Locale = "ar") {
  const { m: ar } = language(locale);
  const data = [
    catalogHeaders(locale),
    [
      ar.seed.sampleMain,
      ar.seed.sampleSecondary,
      ar.seed.sampleSub,
      ar.seed.sampleMaterial,
      ar.seed.units[2][0],
      "",
      "",
      "",
    ],
  ];
  return writeExcelFile(
    data.map((row, i) =>
      row.map((value) => ({
        value,
        fontWeight: i === 0 ? ("bold" as const) : undefined,
        align: locale === "en" ? ("left" as const) : ("right" as const),
      })),
    ),
    {
      sheet: ar.boq.title,
      rightToLeft: locale === "ar",
      stickyRowsCount: 1,
      columns: [24, 24, 28, 48, 15, 24, 40].map((width) => ({ width })),
    },
    { fontFamily: "IBM Plex Sans Arabic", fontSize: 11 },
  ).toBuffer();
}
