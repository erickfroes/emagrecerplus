export function PatientHomeHeader({ patientName }: { patientName: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Portal do paciente</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">Ola, {patientName}</h1>
      <p className="mt-2 text-sm text-slate-500">Registre sua rotina do dia e acompanhe os proximos passos do plano.</p>
    </div>
  );
}
