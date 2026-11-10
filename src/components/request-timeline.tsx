import { Check, Clock3, X } from "lucide-react";
import { ar } from "@/messages/ar";
import { date } from "@/lib/format";
export default function RequestTimeline({
  items,
  currentId,
  digits,
}: {
  items: {
    id: string;
    to_status: unknown;
    user_name: unknown;
    created_at: unknown;
    note: unknown;
  }[];
  currentId: string;
  digits: number;
}) {
  return (
    <ol className="timeline">
      {items.map((item) => {
        const status = Number(item.to_status);
        const stopped = [7, 8].includes(status);
        const current = item.id === currentId && ![5, 6, 7, 8].includes(status);
        const Icon = stopped ? X : current ? Clock3 : Check;
        return (
          <li
            className={
              "timeline-item " +
              (stopped ? "stopped" : current ? "current" : "completed")
            }
            key={item.id}
            aria-current={current ? "step" : undefined}
          >
            <span
              className="timeline-marker"
              aria-label={
                stopped
                  ? "مرفوض أو ملغى"
                  : current
                    ? "المرحلة الحالية"
                    : "مكتملة"
              }
            >
              <Icon size={20} strokeWidth={2.2} />
            </span>
            <p className="timeline-title">{ar.statuses[status]}</p>
            <small>{String(item.user_name)}</small>
            <p className="cell-sub">
              {date(String(item.created_at), digits, true)}
            </p>
            {item.note ? (
              <p className="timeline-note">{String(item.note)}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
