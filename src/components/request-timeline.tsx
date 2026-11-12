import { requestLanguage } from "@/server/language";
import { Check, Clock3, X } from "lucide-react";

import { date } from "@/lib/format";
export default async function RequestTimeline({
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
  const { m: msg, date } = await requestLanguage();
  
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
                  ? msg.interface.stopped
                  : current
                    ? msg.interface.currentStage
                    : msg.interface.completeStage
              }
            >
              <Icon size={20} strokeWidth={2.2} />
            </span>
            <p className="timeline-title">{msg.statuses[status]}</p>
            <small>{String(item.user_name ?? msg.interface.systemActor)}</small>
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
