"use client";

import { useDeferredValue, useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CreateAppointmentModal } from "@/modules/scheduling/components/create-appointment-modal";
import { ScheduleCalendar } from "@/modules/scheduling/components/schedule-calendar";
import { ScheduleToolbar } from "@/modules/scheduling/components/schedule-toolbar";
import { useAppointments } from "@/modules/scheduling/hooks/use-appointments";

export default function SchedulePage() {
  const [currentView, setCurrentView] = useState<"day" | "week" | "list">("day");
  const [date, setDate] = useState(() => formatDateInputValue(new Date()));
  const [unit, setUnit] = useState("");
  const [professional, setProfessional] = useState("");
  const [status, setStatus] = useState("");
  const [isCreateAppointmentOpen, setIsCreateAppointmentOpen] = useState(false);
  const deferredUnit = useDeferredValue(unit);
  const deferredProfessional = useDeferredValue(professional);
  const { data, isLoading, isError } = useAppointments({
    date,
    status,
    unit: deferredUnit,
    professional: deferredProfessional,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Agenda"
        description="Visualize e opere os atendimentos da clinica."
        actions={
          <Button onClick={() => setIsCreateAppointmentOpen(true)}>
            Novo agendamento
          </Button>
        }
      />

      <CreateAppointmentModal
        open={isCreateAppointmentOpen}
        onClose={() => setIsCreateAppointmentOpen(false)}
      />

      <ScheduleToolbar
        date={date}
        unit={unit}
        professional={professional}
        status={status}
        currentView={currentView}
        onDateChange={setDate}
        onUnitChange={setUnit}
        onProfessionalChange={setProfessional}
        onStatusChange={setStatus}
        onTodayClick={() => setDate(formatDateInputValue(new Date()))}
        onViewChange={setCurrentView}
      />

      {isLoading ? <Skeleton className="h-72" /> : null}
      {isError ? <p className="text-sm text-red-600">Erro ao carregar agenda.</p> : null}
      {data ? <ScheduleCalendar currentView={currentView} items={data.items} /> : null}
    </div>
  );
}

function formatDateInputValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
