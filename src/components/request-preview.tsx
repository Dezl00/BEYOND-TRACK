"use client";
import { useLanguage } from "./language-context";
import { useDigits } from "./format-context";

type PreviewLine = {
  key: string;
  label?: string;
  item?: string;
  quantity: string;
  unitName?: string;
  notes: string;
};
export function RequestPreview({
  project,
  notes,
  lines,
}: {
  project: string;
  notes: string;
  lines: PreviewLine[];
}) {
  const { m: msg, number, unit } = useLanguage();
  const digits = useDigits();
  return (
    <>
      <dl className="preview-context">
        <div>
          <dt>{msg.common.project}</dt>
          <dd>{project}</dd>
        </div>
        <div>
          <dt>{msg.interface.usage}</dt>
          <dd>{notes}</dd>
        </div>
      </dl>
      <ul className="preview-materials">
        {lines.map((line) => (
          <li key={line.key}>
            <div>
              <strong>{line.label}</strong>
              <p>
                {msg.fields.boqItem} · {line.item}
              </p>
            </div>
            <div>
              <span>{msg.fields.quantity}</span>
              <p>
                <bdi>{number(line.quantity, digits)}</bdi> {unit(line.unitName)}
              </p>
            </div>
            <div>
              <span>{msg.fields.notes}</span>
              <p>{line.notes.trim() || "—"}</p>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
