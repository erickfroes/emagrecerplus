"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { AppointmentCard } from "@/modules/scheduling/components/appointment-card";
import { AppointmentDetailsDrawer } from "@/modules/scheduling/components/appointment-details-drawer";
import type { AppointmentListItem } from "@/types/api";

export function ScheduleCalendar({
  items,
  currentView,
}: {
  items: AppointmentListItem[];
  currentView: "day" | "week" | "list";
}) {
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const selectedAppointment =
    items.find((appointment) => appointment.id === selectedAppointmentId) ?? null;

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-950">Agenda</h2>
          <p className="text-sm text-slate-500">Visao: {currentView}</p>
        </div>

        <div className="space-y-3">
          {items.map((item) => (
            <AppointmentCard
              key={item.id}
              appointment={item}
              onSelect={(appointment) => setSelectedAppointmentId(appointment.id)}
            />
          ))}
        </div>
      </Card>

      <AppointmentDetailsDrawer
        appointment={selectedAppointment}
        open={selectedAppointmentId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedAppointmentId(null);
          }
        }}
      />
    </>
  );
}
