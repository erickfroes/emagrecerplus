import { Card } from "@/components/ui/card";

export function PatientAppTargetCard() {
  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-950">Paciente nao selecionado</h1>
      <p className="mt-2 text-sm text-slate-500">
        Para pre-visualizar o cockpit pelo acesso administrativo, abra esta rota com o parametro
        <span className="font-medium text-slate-700"> ?patientId=&lt;id-do-paciente&gt;</span>.
      </p>
    </Card>
  );
}
