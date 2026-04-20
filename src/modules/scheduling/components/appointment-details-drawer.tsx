"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { useCancelAppointment } from "@/modules/scheduling/hooks/use-cancel-appointment";
import { useCheckinAppointment } from "@/modules/scheduling/hooks/use-checkin-appointment";
import { useConfirmAppointment } from "@/modules/scheduling/hooks/use-confirm-appointment";
import { useMarkNoShow } from "@/modules/scheduling/hooks/use-mark-no-show";
import { useRescheduleAppointment } from "@/modules/scheduling/hooks/use-reschedule-appointment";
import type { AppointmentListItem } from "@/types/api";

export function AppointmentDetailsDrawer({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: AppointmentListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const confirmMutation = useConfirmAppointment();
  const cancelMutation = useCancelAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const checkInMutation = useCheckinAppointment();
  const noShowMutation = useMarkNoShow();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");

  useEffect(() => {
    if (!appointment || !open) {
      setActionMessage(null);
      setReason("");
      setCurrentStatus("");
      setStartsAt("");
      setEndsAt("");
      return;
    }

    setActionMessage(null);
    setReason("");
    setCurrentStatus(appointment.status);
    setStartsAt(toDatetimeLocalValue(appointment.startsAt));
    setEndsAt(toDatetimeLocalValue(appointment.endsAt));
  }, [appointment, open]);

  if (!appointment) {
    return null;
  }

  const currentAppointment = appointment;
  const isLocked = ["Check-in", "Em atendimento", "Concluido", "No-show", "Cancelado"].includes(
    currentStatus
  );
  const canConfirm = currentStatus === "Agendado";
  const canCancel = !isLocked;
  const canReschedule = !isLocked;
  const canCheckIn = !isLocked;
  const canMarkNoShow = !isLocked;

  async function handleConfirm() {
    const result = await confirmMutation.mutateAsync(currentAppointment.id);
    setCurrentStatus(result.status);
    setActionMessage(`Status atualizado para ${result.status}.`);
  }

  async function handleCancel() {
    const result = await cancelMutation.mutateAsync({
      id: currentAppointment.id,
      reason: reason.trim() || undefined,
    });
    setCurrentStatus(result.status);
    setActionMessage(`Status atualizado para ${result.status}.`);
  }

  async function handleReschedule() {
    if (!startsAt || !endsAt) {
      return;
    }

    const result = await rescheduleMutation.mutateAsync({
      id: currentAppointment.id,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      reason: reason.trim() || undefined,
    });

    setCurrentStatus(result.status);
    setStartsAt(toDatetimeLocalValue(result.startsAt));
    setEndsAt(toDatetimeLocalValue(result.endsAt));
    setActionMessage("Agendamento remarcado com sucesso.");
  }

  async function handleCheckIn() {
    const result = await checkInMutation.mutateAsync(currentAppointment.id);
    setCurrentStatus(result.status);
    setActionMessage(`Status atualizado para ${result.status}.`);
  }

  async function handleMarkNoShow() {
    const result = await noShowMutation.mutateAsync({
      id: currentAppointment.id,
      reason: reason.trim() || undefined,
    });
    setCurrentStatus(result.status);
    setActionMessage(`Status atualizado para ${result.status}.`);
  }

  const hasError =
    confirmMutation.isError ||
    cancelMutation.isError ||
    rescheduleMutation.isError ||
    checkInMutation.isError ||
    noShowMutation.isError;

  return (
    <Drawer
      title="Detalhes do agendamento"
      description="Resumo operacional com remarcacao, confirmacao, cancelamento, check-in e no-show."
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleReschedule}
            disabled={rescheduleMutation.isPending || !canReschedule || !startsAt || !endsAt}
          >
            {rescheduleMutation.isPending ? "Remarcando..." : "Remarcar"}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleCancel}
            disabled={cancelMutation.isPending || !canCancel}
          >
            {cancelMutation.isPending ? "Cancelando..." : "Cancelar"}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleMarkNoShow}
            disabled={noShowMutation.isPending || !canMarkNoShow}
          >
            {noShowMutation.isPending ? "Atualizando..." : "Registrar no-show"}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleConfirm}
            disabled={confirmMutation.isPending || !canConfirm}
          >
            {confirmMutation.isPending ? "Confirmando..." : "Confirmar"}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleCheckIn}
            disabled={checkInMutation.isPending || !canCheckIn}
          >
            {checkInMutation.isPending ? "Atualizando..." : "Check-in"}
          </Button>
          <Button size="sm" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Paciente</p>
          <p className="mt-1 font-medium text-slate-950">{appointment.patient}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Atendimento</p>
          <p className="mt-1 font-medium text-slate-950">{appointment.type}</p>
          <p className="mt-1 text-sm text-slate-500">{appointment.professional}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Horario atual</p>
          <p className="mt-1 font-medium text-slate-950">{appointment.time}</p>
          <p className="mt-1 text-sm text-slate-500">
            {appointment.room ?? "Recurso ainda nao definido"}
          </p>
        </div>
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Status</p>
          <div className="mt-2">
            <Badge>{currentStatus}</Badge>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Remarcacao</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Input type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
            <Input type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 p-4">
          <label className="text-sm text-slate-500" htmlFor="appointment-operational-note">
            Observacao operacional
          </label>
          <textarea
            id="appointment-operational-note"
            className="mt-3 min-h-24 w-full rounded-2xl border border-border px-3 py-2 text-sm text-slate-700 outline-none"
            placeholder="Use para motivo de remarcacao, cancelamento ou no-show."
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>

        {hasError ? (
          <p className="text-sm text-red-600">Erro ao atualizar o agendamento.</p>
        ) : null}
        {actionMessage ? <p className="text-sm text-emerald-700">{actionMessage}</p> : null}
      </div>
    </Drawer>
  );
}

function toDatetimeLocalValue(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
