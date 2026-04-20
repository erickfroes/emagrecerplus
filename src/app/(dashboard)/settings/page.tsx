import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Configurações"
        description="Área reservada para parâmetros da unidade, equipe e automações clínicas."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <h2 className="text-base font-semibold text-slate-950">Unidade ativa</h2>
          <p className="mt-2 text-sm text-slate-500">Matriz • Araguaína</p>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-slate-950">Perfis e permissões</h2>
          <p className="mt-2 text-sm text-slate-500">Base pronta para vincular regras por função e por unidade.</p>
        </Card>
        <Card>
          <h2 className="text-base font-semibold text-slate-950">Integrações</h2>
          <p className="mt-2 text-sm text-slate-500">Espaço preparado para API, notificações e canais externos.</p>
        </Card>
      </div>
    </div>
  );
}
