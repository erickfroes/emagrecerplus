import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  items: Array<{
    id: string;
    title: string;
    patient: string;
    priority: string;
    status: string;
  }>;
};

export function ClinicalTasksTable({ items }: Props) {
  return (
    <Card className="overflow-hidden p-0">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-3">Tarefa</th>
            <th className="px-4 py-3">Paciente</th>
            <th className="px-4 py-3">Prioridade</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 bg-surface text-sm">
          {items.map((task) => (
            <tr key={task.id}>
              <td className="px-4 py-3 font-medium text-slate-900">{task.title}</td>
              <td className="px-4 py-3 text-slate-600">{task.patient}</td>
              <td className="px-4 py-3">
                <Badge tone={task.priority === "HIGH" ? "danger" : "warning"}>{task.priority}</Badge>
              </td>
              <td className="px-4 py-3">
                <Badge>{task.status}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}