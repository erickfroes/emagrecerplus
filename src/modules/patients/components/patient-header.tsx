import { PatientFlagsInline } from "@/modules/patients/components/patient-flags-inline";
import { PatientTagsInline } from "@/modules/patients/components/patient-tags-inline";
import { Button } from "@/components/ui/button";

export function PatientHeader({
  name,
  age,
  email,
  phone,
  tags,
  flags,
}: {
  name: string;
  age: number;
  email: string;
  phone: string;
  tags: string[];
  flags: string[];
}) {
  return (
    <div className="rounded-3xl border border-border bg-surface p-5 shadow-[0_18px_45px_-32px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-950">{name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {age} anos · {email} · {phone}
          </p>

          <div className="mt-3 flex flex-col gap-2">
            <PatientTagsInline tags={tags} />
            <PatientFlagsInline flags={flags} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary">Novo agendamento</Button>
          <Button variant="secondary">Nova evolucao</Button>
          <Button variant="secondary">Nova tarefa clinica</Button>
          <Button variant="secondary">Adicionar flag</Button>
          <Button>Registrar habito</Button>
        </div>
      </div>
    </div>
  );
}
