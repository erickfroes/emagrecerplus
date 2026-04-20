"use client";

import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardSummary } from "@/modules/dashboard/hooks/use-dashboard-summary";
import { CriticalAlertsPanel } from "@/modules/dashboard/components/critical-alerts-panel";
import { PipelineMiniBoard } from "@/modules/dashboard/components/pipeline-mini-board";
import { QuickActionsCard } from "@/modules/dashboard/components/quick-actions-card";
import { StatsCard } from "@/modules/dashboard/components/stats-card";
import { TodayScheduleList } from "@/modules/dashboard/components/today-schedule-list";

export default function DashboardPage() {
  const { data, isLoading, isError } = useDashboardSummary();

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Visao rapida da operacao clinica, comercial e assistencial."
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-32" />
          ))}
        </div>
      ) : null}

      {isError ? <p className="text-sm text-red-600">Erro ao carregar dashboard.</p> : null}

      {data ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <StatsCard label="Agendados hoje" value={data.stats.scheduledToday} />
            <StatsCard label="Consultas concluidas" value={data.stats.completedToday} />
            <StatsCard label="No-shows (7d)" value={data.stats.noShows7d} />
            <StatsCard label="Leads em aberto" value={data.stats.openLeads} />
            <StatsCard label="Tarefas pendentes" value={data.stats.openClinicalTasks} />
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <TodayScheduleList items={data.todayAppointments} />
            <QuickActionsCard />
          </div>

          <div className="mt-6">
            <PipelineMiniBoard items={data.pipeline} />
          </div>

          <div className="mt-6">
            <CriticalAlertsPanel items={data.alerts} />
          </div>
        </>
      ) : null}
    </div>
  );
}
