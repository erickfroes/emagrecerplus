import { Card } from "@/components/ui/card";

export function UpcomingAppointmentCard({
  dateLabel,
  professional,
  type,
}: {
  dateLabel: string;
  professional: string;
  type: string;
}) {
  return (
    <Card>
      <p className="text-sm text-slate-500">Proximo agendamento</p>
      <p className="mt-3 text-2xl font-semibold text-slate-950">{dateLabel}</p>
      <p className="mt-2 text-sm text-slate-500">
        {type} · {professional}
      </p>
    </Card>
  );
}
