import { Badge } from "@/components/ui/badge";
import type { AppointmentListItem } from "@/types/api";

export function AppointmentCard({
  appointment,
  onSelect,
}: {
  appointment: AppointmentListItem;
  onSelect: (appointment: AppointmentListItem) => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between rounded-2xl border border-slate-100 p-3 text-left transition hover:border-slate-200 hover:bg-slate-50"
      onClick={() => onSelect(appointment)}
      type="button"
    >
      <div>
        <p className="text-sm font-medium text-slate-950">
          {appointment.time} · {appointment.patient}
        </p>
        <p className="text-xs text-slate-500">
          {appointment.type} · {appointment.professional}
        </p>
      </div>
      <Badge>{appointment.status}</Badge>
    </button>
  );
}
