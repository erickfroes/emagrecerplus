"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  createPatientAppDailyCheckin,
  createPatientAppMealLog,
  createPatientAppSleepLog,
  createPatientAppSymptomLog,
  createPatientAppWaterLog,
  createPatientAppWorkoutLog,
} from "@/modules/patient-app/api/patient-app";
import type { CreateDailyCheckInInput } from "@/modules/patient-app/types";
import { usePatientAppLogMutation } from "@/modules/patient-app/hooks/use-patient-app-log-mutation";

export type PatientAppQuickActionId =
  | "daily-checkin"
  | "water"
  | "meal"
  | "workout"
  | "sleep"
  | "symptom";

type QuickActionModalProps = {
  action: PatientAppQuickActionId | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const moodOptions: Array<{ value: NonNullable<CreateDailyCheckInInput["mood"]>; label: string }> = [
  { value: "great", label: "Otimo" },
  { value: "good", label: "Bem" },
  { value: "neutral", label: "Neutro" },
  { value: "bad", label: "Mal" },
  { value: "terrible", label: "Pessimo" },
];

const adherenceOptions = [
  { value: 5, label: "Excelente" },
  { value: 4, label: "Boa" },
  { value: 3, label: "Ok" },
  { value: 2, label: "Baixa" },
  { value: 1, label: "Ruim" },
];

const modalRouteMap: Record<PatientAppQuickActionId, string> = {
  "daily-checkin": "/app",
  water: "/app/water",
  meal: "/app/meals",
  workout: "/app/workouts",
  sleep: "/app/sleep",
  symptom: "/app/symptoms",
};

function HistoryLink({
  action,
  onOpenChange,
}: {
  action: PatientAppQuickActionId;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Link
      href={modalRouteMap[action]}
      onClick={() => onOpenChange(false)}
      className="text-sm font-medium text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
    >
      Abrir historico completo
    </Link>
  );
}

function DailyCheckinModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [checkinDate, setCheckinDate] = useState(today);
  const [mood, setMood] = useState<NonNullable<CreateDailyCheckInInput["mood"]>>("good");
  const [energyScore, setEnergyScore] = useState("7");
  const [sleepHours, setSleepHours] = useState("7.5");
  const [hungerLevel, setHungerLevel] = useState("3");
  const [notes, setNotes] = useState("");
  const mutation = usePatientAppLogMutation(createPatientAppDailyCheckin);

  async function handleSubmit() {
    await mutation.mutateAsync({
      checkinDate,
      mood,
      energyScore: Number(energyScore) || undefined,
      sleepHours: Number(sleepHours) || undefined,
      hungerLevel: Number(hungerLevel) || undefined,
      notes: notes.trim() || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Check-in diario"
      description="Registre como foi seu dia para manter o acompanhamento clinico atualizado."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar check-in"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input type="date" value={checkinDate} onChange={(event) => setCheckinDate(event.target.value)} />

        <div className="grid gap-2 sm:grid-cols-5">
          {moodOptions.map((option) => (
            <Button
              key={option.value}
              variant={mood === option.value ? "primary" : "secondary"}
              onClick={() => setMood(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Input
            min={1}
            max={10}
            type="number"
            placeholder="Energia"
            value={energyScore}
            onChange={(event) => setEnergyScore(event.target.value)}
          />
          <Input
            min={0.1}
            max={24}
            step="0.1"
            type="number"
            placeholder="Sono (h)"
            value={sleepHours}
            onChange={(event) => setSleepHours(event.target.value)}
          />
          <Input
            min={1}
            max={5}
            type="number"
            placeholder="Fome (1-5)"
            value={hungerLevel}
            onChange={(event) => setHungerLevel(event.target.value)}
          />
        </div>

        <textarea
          className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10"
          placeholder="Observacoes do dia"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        {mutation.isError ? (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}

        <HistoryLink action="daily-checkin" onOpenChange={onOpenChange} />
      </div>
    </Modal>
  );
}

function WaterModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amountMl, setAmountMl] = useState("300");
  const mutation = usePatientAppLogMutation(createPatientAppWaterLog);

  async function handleSubmit(amount = Number(amountMl) || 0) {
    await mutation.mutateAsync({ amountMl: amount });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar hidratacao"
      description="Adicione rapidamente sua agua sem sair da home."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar agua"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {[250, 350, 500].map((amount) => (
            <Button key={amount} variant="secondary" onClick={() => void handleSubmit(amount)}>
              + {amount} ml
            </Button>
          ))}
        </div>

        <Input
          type="number"
          min={1}
          placeholder="Quantidade manual em ml"
          value={amountMl}
          onChange={(event) => setAmountMl(event.target.value)}
        />

        {mutation.isError ? (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}

        <HistoryLink action="water" onOpenChange={onOpenChange} />
      </div>
    </Modal>
  );
}

function MealModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [mealType, setMealType] = useState("Cafe da manha");
  const [description, setDescription] = useState("");
  const [adherenceRating, setAdherenceRating] = useState("4");
  const mutation = usePatientAppLogMutation(createPatientAppMealLog);

  async function handleSubmit() {
    await mutation.mutateAsync({
      mealType,
      description: description.trim() || undefined,
      adherenceRating: Number(adherenceRating) || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar refeicao"
      description="Mantenha sua alimentacao refletida no cockpit em tempo real."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar refeicao"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input value={mealType} onChange={(event) => setMealType(event.target.value)} placeholder="Tipo de refeicao" />
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10"
          placeholder="Descricao curta"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <select
          className="h-11 w-full rounded-2xl border border-border bg-transparent px-3 text-sm"
          value={adherenceRating}
          onChange={(event) => setAdherenceRating(event.target.value)}
        >
          {adherenceOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {mutation.isError ? (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}

        <HistoryLink action="meal" onOpenChange={onOpenChange} />
      </div>
    </Modal>
  );
}

function WorkoutModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [workoutType, setWorkoutType] = useState("Caminhada");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [intensity, setIntensity] = useState("Moderada");
  const mutation = usePatientAppLogMutation(createPatientAppWorkoutLog);

  async function handleSubmit() {
    await mutation.mutateAsync({
      workoutType,
      durationMinutes: Number(durationMinutes) || undefined,
      intensity: intensity.trim() || undefined,
      completed: true,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar treino"
      description="Atualize seu treino do dia direto no cockpit."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar treino"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input value={workoutType} onChange={(event) => setWorkoutType(event.target.value)} placeholder="Tipo de treino" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="number"
            min={1}
            placeholder="Duracao em minutos"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
          <Input value={intensity} onChange={(event) => setIntensity(event.target.value)} placeholder="Intensidade" />
        </div>

        {mutation.isError ? (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}

        <HistoryLink action="workout" onOpenChange={onOpenChange} />
      </div>
    </Modal>
  );
}

function SleepModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [sleepDate, setSleepDate] = useState(today);
  const [hours, setHours] = useState("7.5");
  const [qualityScore, setQualityScore] = useState("7");
  const mutation = usePatientAppLogMutation(createPatientAppSleepLog);

  async function handleSubmit() {
    await mutation.mutateAsync({
      sleepDate,
      hours: Number(hours) || undefined,
      qualityScore: Number(qualityScore) || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar sono"
      description="Anote seu descanso para refletir a consistencia da semana."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar sono"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input type="date" value={sleepDate} onChange={(event) => setSleepDate(event.target.value)} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            type="number"
            min={0.1}
            max={24}
            step="0.1"
            placeholder="Horas dormidas"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
          <Input
            type="number"
            min={1}
            max={10}
            placeholder="Qualidade de 1 a 10"
            value={qualityScore}
            onChange={(event) => setQualityScore(event.target.value)}
          />
        </div>

        {mutation.isError ? (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}

        <HistoryLink action="sleep" onOpenChange={onOpenChange} />
      </div>
    </Modal>
  );
}

function SymptomModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [symptomType, setSymptomType] = useState("Ansiedade");
  const [severityScore, setSeverityScore] = useState("4");
  const [description, setDescription] = useState("");
  const mutation = usePatientAppLogMutation(createPatientAppSymptomLog);

  async function handleSubmit() {
    await mutation.mutateAsync({
      symptomType,
      severityScore: Number(severityScore) || undefined,
      description: description.trim() || undefined,
    });
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Registrar sintoma"
      description="Compartilhe como voce esta se sentindo para priorizar acompanhamento."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar sintoma"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input value={symptomType} onChange={(event) => setSymptomType(event.target.value)} placeholder="Tipo de sintoma" />
        <Input
          type="number"
          min={0}
          max={10}
          placeholder="Gravidade de 0 a 10"
          value={severityScore}
          onChange={(event) => setSeverityScore(event.target.value)}
        />
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10"
          placeholder="Descricao"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />

        {mutation.isError ? (
          <p className="text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}

        <HistoryLink action="symptom" onOpenChange={onOpenChange} />
      </div>
    </Modal>
  );
}

export function PatientAppQuickActionModal({
  action,
  open,
  onOpenChange,
}: QuickActionModalProps) {
  if (!action || !open) {
    return null;
  }

  switch (action) {
    case "daily-checkin":
      return <DailyCheckinModal open={open} onOpenChange={onOpenChange} />;
    case "water":
      return <WaterModal open={open} onOpenChange={onOpenChange} />;
    case "meal":
      return <MealModal open={open} onOpenChange={onOpenChange} />;
    case "workout":
      return <WorkoutModal open={open} onOpenChange={onOpenChange} />;
    case "sleep":
      return <SleepModal open={open} onOpenChange={onOpenChange} />;
    case "symptom":
      return <SymptomModal open={open} onOpenChange={onOpenChange} />;
    default:
      return null;
  }
}
