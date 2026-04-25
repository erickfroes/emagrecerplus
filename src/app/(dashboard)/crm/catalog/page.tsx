"use client";

import { ArrowLeft, BriefcaseBusiness, Layers3, Package2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useCommercialCatalog } from "@/modules/crm/hooks/use-commercial-catalog";

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
});

export default function CrmCatalogPage() {
  const router = useRouter();
  const { data, isLoading, isError } = useCommercialCatalog();

  const services = data?.services ?? [];
  const packages = data?.packages ?? [];
  const packageServices = data?.packageServices ?? [];
  const programs = data?.programs ?? [];
  const programPackages = data?.programPackages ?? [];

  const servicesById = new Map(services.map((service) => [service.id, service]));
  const packagesById = new Map(packages.map((pkg) => [pkg.id, pkg]));

  const isEmpty =
    services.length === 0 &&
    packages.length === 0 &&
    packageServices.length === 0 &&
    programs.length === 0 &&
    programPackages.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogo comercial"
        description="Servicos, pacotes e programas do runtime comercial. Esta e a base para matriculas, elegibilidade e separacao financeira."
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push("/crm")}>
              <ArrowLeft className="h-4 w-4" />
              Voltar ao CRM
            </Button>
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Servicos
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold text-slate-950">{services.length}</p>
              <p className="mt-1 text-sm text-slate-500">Itens do catalogo base</p>
            </div>
            <BriefcaseBusiness className="h-5 w-5 text-slate-400" />
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Pacotes
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold text-slate-950">{packages.length}</p>
              <p className="mt-1 text-sm text-slate-500">Composicoes comerciais publicaveis</p>
            </div>
            <Package2 className="h-5 w-5 text-slate-400" />
          </div>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Programas
          </p>
          <div className="mt-4 flex items-end justify-between">
            <div>
              <p className="text-3xl font-semibold text-slate-950">{programs.length}</p>
              <p className="mt-1 text-sm text-slate-500">Tracks com elegibilidade futura</p>
            </div>
            <Layers3 className="h-5 w-5 text-slate-400" />
          </div>
        </Card>
      </div>

      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      ) : null}

      {isError ? (
        <p className="text-sm text-red-600">
          Erro ao carregar o catalogo comercial do runtime.
        </p>
      ) : null}

      {!isLoading && !isError && isEmpty ? (
        <EmptyState
          title="Catalogo comercial vazio"
          description="O runtime ja suporta servicos, pacotes e programas, mas esta unidade ainda nao tem itens cadastrados."
        />
      ) : null}

      {!isLoading && !isError && !isEmpty ? (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">Servicos</p>
              <p className="mt-1 text-sm text-slate-500">
                Base reutilizavel para consultas, avaliacoes e entregas comerciais.
              </p>
            </div>

            <div className="space-y-3">
              {services.map((service) => (
                <div
                  key={service.id}
                  className="rounded-2xl border border-border bg-slate-50 px-4 py-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{service.name}</p>
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        {service.serviceType}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                        service.active
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-200 text-slate-600"
                      }`}
                    >
                      {service.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-500">
                    {service.description || "Sem descricao operacional registrada."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span className="rounded-full bg-white px-2 py-1">
                      Codigo: {service.code}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1">
                      Duracao:{" "}
                      {service.durationMinutes ? `${service.durationMinutes} min` : "sob demanda"}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1">
                      {currencyFormatter.format(service.listPrice)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">Pacotes</p>
              <p className="mt-1 text-sm text-slate-500">
                Combinacoes de servicos prontas para venda, upgrade e renovacao.
              </p>
            </div>

            <div className="space-y-3">
              {packages.map((pkg) => {
                const linkedServices = packageServices.filter(
                  (packageService) => packageService.packageId === pkg.id
                );

                return (
                  <div
                    key={pkg.id}
                    className="rounded-2xl border border-border bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{pkg.name}</p>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          {pkg.packageType} • {pkg.billingModel}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {pkg.featured ? (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                            Destaque
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            pkg.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {pkg.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-slate-500">
                      {pkg.description || "Sem descricao comercial registrada."}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-2 py-1">
                        {currencyFormatter.format(pkg.price)}
                      </span>
                      <span className="rounded-full bg-white px-2 py-1">
                        {pkg.serviceCount} servico(s)
                      </span>
                      {pkg.tier ? (
                        <span className="rounded-full bg-white px-2 py-1">
                          Tier: {pkg.tier}
                        </span>
                      ) : null}
                    </div>

                    {linkedServices.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {linkedServices.map((link) => {
                          const service = servicesById.get(link.serviceId);

                          return (
                            <div
                              key={link.id}
                              className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              <span>
                                {service?.name ?? link.serviceId}
                                {link.required ? " • obrigatorio" : " • opcional"}
                              </span>
                              <span>Qtd. {link.quantity}</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-slate-950">Programas</p>
              <p className="mt-1 text-sm text-slate-500">
                Encadeamentos que vao sustentar matriculas, entitlements e elegibilidade.
              </p>
            </div>

            <div className="space-y-3">
              {programs.map((program) => {
                const linkedPackages = programPackages
                  .filter((programPackage) => programPackage.programId === program.id)
                  .sort((left, right) => left.sortOrder - right.sortOrder);

                return (
                  <div
                    key={program.id}
                    className="rounded-2xl border border-border bg-slate-50 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-950">{program.name}</p>
                        <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                          {program.programType}
                        </p>
                      </div>
                      <div className="flex flex-wrap justify-end gap-2">
                        {program.featured ? (
                          <span className="rounded-full bg-violet-100 px-2 py-1 text-[11px] font-semibold text-violet-700">
                            Curado
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                            program.active
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {program.active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </div>

                    <p className="mt-2 text-sm text-slate-500">
                      {program.description || "Sem descricao de programa registrada."}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="rounded-full bg-white px-2 py-1">
                        {program.packageCount} pacote(s)
                      </span>
                      <span className="rounded-full bg-white px-2 py-1">
                        Duracao:{" "}
                        {program.durationDays ? `${program.durationDays} dias` : "flexivel"}
                      </span>
                    </div>

                    {linkedPackages.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {linkedPackages.map((link) => {
                          const linkedPackage = packagesById.get(link.packageId);

                          return (
                            <div
                              key={link.id}
                              className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-xs text-slate-600"
                            >
                              <span>{linkedPackage?.name ?? link.packageId}</span>
                              <span className="flex items-center gap-2">
                                {link.recommended ? (
                                  <span className="rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700">
                                    Recomendado
                                  </span>
                                ) : null}
                                <span>Ordem {link.sortOrder + 1}</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      ) : null}

      {!isLoading && !isError && !isEmpty ? (
        <Card className="flex items-start gap-3">
          <Sparkles className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <p className="text-sm font-semibold text-slate-950">Proximo encaixe do plano</p>
            <p className="mt-1 text-sm text-slate-500">
              Com este catalogo no runtime, o proximo passo logico da Etapa 10 e abrir
              matriculas, entitlements e elegibilidade do paciente sobre essas entidades.
            </p>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
