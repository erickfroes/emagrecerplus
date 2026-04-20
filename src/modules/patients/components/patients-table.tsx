import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/ui/table";
import { formatShortDateTime } from "@/lib/utils";
import { PatientFlagsInline } from "@/modules/patients/components/patient-flags-inline";
import { PatientStatusBadge } from "@/modules/patients/components/patient-status-badge";
import { PatientTagsInline } from "@/modules/patients/components/patient-tags-inline";
import type { PatientListItem } from "@/types/api";

function formatDate(value: string | null) {
  return value ? formatShortDateTime(value) : "-";
}

export function PatientsTable({ rows }: { rows: PatientListItem[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <Table>
        <TableHead>
          <TableRow>
            <TableHeaderCell>Paciente</TableHeaderCell>
            <TableHeaderCell>Contato</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Tags</TableHeaderCell>
            <TableHeaderCell>Flags</TableHeaderCell>
            <TableHeaderCell>Ultima consulta</TableHeaderCell>
            <TableHeaderCell>Proxima consulta</TableHeaderCell>
            <TableHeaderCell>Acoes</TableHeaderCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <p className="font-medium text-slate-950">{row.name}</p>
                <p className="text-xs text-slate-500">{row.email ?? "-"}</p>
              </TableCell>
              <TableCell className="text-slate-600">{row.phone ?? "-"}</TableCell>
              <TableCell>
                <PatientStatusBadge status={row.status} />
              </TableCell>
              <TableCell>
                <PatientTagsInline tags={row.tags} />
              </TableCell>
              <TableCell>
                <PatientFlagsInline flags={row.flags} />
              </TableCell>
              <TableCell className="text-slate-600">{formatDate(row.lastConsultation)}</TableCell>
              <TableCell className="text-slate-600">{formatDate(row.nextAppointment)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={`/patients/${row.id}`}
                    className="rounded-xl border border-(--border) px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Abrir
                  </Link>
                  <button className="rounded-xl border border-(--border) px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50" type="button">
                    Agendar
                  </button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
