"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { useCancelAppointment } from "@/modules/scheduling/hooks/use-cancel-appointment";
import { useCheckinAppointment } from "@/modules/scheduling/hooks/use-checkin-appointment";
import { useConfirmAppointment } from "@/modules/scheduling/hooks/use-confirm-appointment";
import { useEnqueuePatient } from "@/modules/scheduling/hooks/use-enqueue-patient";
import { useMarkNoShow } from "@/modules/scheduling/hooks/use-mark-no-show";
import { useRescheduleAppointment } from "@/modules/scheduling/hooks/use-reschedule-appointment";
import { useStartEncounter } from "@/modules/scheduling/hooks/use-start-encounter";
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
  const router = useRouter();
  const { can } = usePermissions();
  const confirmMutation = useConfirmAppointment();
  const cancelMutation = useCancelAppointment();
  const rescheduleMutation = useRescheduleAppointment();
  const checkInMutation = useCheckinAppointment();
  const enqueueMutation = useEnqueuePatient();
  const noShowMutation = useMarkNoShow();
  const startEncounterMutation = useStartEncounter();
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [currentStatus, setCurrentStatus] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [queuedDuringSession, setQueuedDuringSession] = useState(false);

  useEffect(() => {
    if (!appointment || !open) {
      setActionMessage(null);
      setReason("");
      setCurrentStatus("");
      setStartsAt("");
      setEndsAt("");
      setQueuedDuringSession(false);
      return;
    }

    setActionMessage(null);
    setReason("");
    setCurrentStatus(appointment.status);
    setStartsAt(toDatetimeLocalValue(appointment.startsAt));
    setEndsAt(toDatetimeLocalValue(appointment.endsAt));
    setQueuedDuringSession(false);
  }, [appointment, open]);

  if (!appointment) {
    return null;
  }

  const currentAppointment = appointment;
  const canWrite = can("schedule:write");
  const isLocked = ["Check-in", "Em atendimento", "Concluido", "No-show", "Cancelado"].includes(
    currentStatus
  );
  const canConfirm = canWrite && currentStatus === "Agendado";
  const canCancel = canWrite && !isLocked;
  const canReschedule = canWrite && !isLocked;
  const canCheckIn = canWrite && !isLocked;
  const canEnqueue = canWrite && currentStatus === "Check-in" && !queuedDuringSession;
  const canMarkNoShow = canWrite && !isLocked;
  const canStartEncounter =
    canWrite &&
    can("clinical:write") &&
    ["Agendado", "Confirmado", "Check-in", "Em atendimento"].includes(currentStatus);

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

  async function handleEnqueue() {
    const result = await enqueueMutation.mutateAsync(currentAppointment.id);
    setQueuedDuringSession(true);
    setActionMessage(`Paciente encaminhado para ${result.queueStatus.toLowerCase()}.`);
  }

  async function handleMarkNoShow() {
    const result = await noShowMutation.mutateAsync({
      id: currentAppointment.id,
      reason: reason.trim() || undefined,
    });
    setCurrentStatus(result.status);
    setActionMessage(`Status atualizado para ${result.status}.`);
  }

  async function handleStartEncounter() {
    const result = await startEncounterMutation.mutateAsync(currentAppointment.id);
    setCurrentStatus(result.appointmentStatus);
    setActionMessage("Atendimento iniciado. Abrindo prontuario...");
    onOpenChange(false);
    router.push(`/clinical/encounters/${result.encounterId}`);
  }

  const hasError =
    confirmMutation.isError ||
    cancelMutation.isError ||
    rescheduleMutation.isError ||
    checkInMutation.isError ||
    enqueueMutation.isError ||
    noShowMutation.isError ||
    startEncounterMutation.isError;

  return (
    <Drawer
      title="Detalhes do agendamento"
      description="Resumo operacional com remarcacao, confirmacao, check-in, fila, inicio do atendimento, cancelamento e no-show."
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
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleEnqueue}
            disabled={enqueueMutation.isPending || !canEnqueue}
          >
            {enqueueMutation.isPending ? "Encaminhando..." : "Encaminhar para fila"}
          </Button>
          <Button
            size="sm"
            type="button"
            variant="secondary"
            onClick={handleStartEncounter}
            disabled={startEncounterMutation.isPending || !canStartEncounter}
          >
            {startEncounterMutation.isPending ? "Abrindo..." : "Iniciar atendimento"}
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
            <Input
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              disabled={!canWrite}
            />
            <Input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              disabled={!canWrite}
            />
          </div>
          {!canWrite ? (
            <p className="mt-2 text-xs text-slate-500">
              Sua sessao pode consultar a agenda, mas nao operar confirmacao, remarcacao ou check-in.
            </p>
          ) : null}
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
            disabled={!canWrite}
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
