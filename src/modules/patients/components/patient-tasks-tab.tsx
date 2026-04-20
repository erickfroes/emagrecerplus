import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PatientTaskListItem } from "@/types/api";

export function PatientTasksTab({ tasks }: { tasks: PatientTaskListItem[] }) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold text-slate-950">Tarefas</h2>
      <div className="space-y-3">
        {tasks.length ? (
          tasks.map((task) => (
            <div key={task.id} className="rounded-2xl border border-slate-100 p-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-950">{task.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Responsavel: {task.owner} · Vencimento: {task.dueDate}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Badge tone={task.priority === "Alta" ? "danger" : "warning"}>{task.priority}</Badge>
                  <Badge>{task.status}</Badge>
                </div>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nenhuma tarefa aberta para este paciente.</p>
        )}
      </div>
    </Card>
  );
}
