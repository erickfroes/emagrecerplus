import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PatientDetail } from "@/modules/patients/types";

export function PatientClinicalTab({ clinical }: { clinical: PatientDetail["clinical"] }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold text-slate-950">Visão clínica</h2>
      <div className="space-y-3 text-sm text-slate-600">
        <p>Plano atual: {clinical.currentPlan}</p>
        <p>Última evolução SOAP: {clinical.lastSoap}</p>
        <div>
          <p className="mb-2 font-medium text-slate-950">Flags</p>
          <div className="flex flex-wrap gap-2">
            {clinical.flags.map((flag) => (
              <Badge key={flag}>{flag}</Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 font-medium text-slate-950">Protocolos ativos</p>
          <ul className="space-y-1">
            {clinical.activeProtocols.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}
