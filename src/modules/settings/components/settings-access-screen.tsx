"use client";

import { startTransition, useEffect, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { HttpError } from "@/lib/http";
import { useCreateTeamInvitation } from "../hooks/use-create-team-invitation";
import { useRevokeTeamInvitation } from "../hooks/use-revoke-team-invitation";
import { useSettingsAccessOverview } from "../hooks/use-settings-access-overview";

type FeedbackState =
  | { tone: "success"; message: string }
  | { tone: "danger"; message: string }
  | null;

type InvitationFormState = {
  email: string;
  roleCode: string;
  unitIds: string[];
  expiresInDays: number;
  note: string;
};

function toneForStatus(status: string) {
  if (status === "active" || status === "accepted") {
    return "success" as const;
  }

  if (status === "suspended" || status === "expired") {
    return "warning" as const;
  }

  if (status === "revoked") {
    return "danger" as const;
  }

  return "default" as const;
}

function labelForStatus(status: string) {
  switch (status) {
    case "active":
      return "Ativo";
    case "invited":
      return "Convidado";
    case "suspended":
      return "Suspenso";
    case "accepted":
      return "Aceito";
    case "expired":
      return "Expirado";
    case "revoked":
      return "Revogado";
    case "pending":
      return "Pendente";
    default:
      return status;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function extractErrorMessage(error: unknown) {
  if (error instanceof HttpError) {
    if (error.payload && typeof error.payload === "object" && "message" in error.payload) {
      const payload = error.payload as { message?: unknown };

      if (typeof payload.message === "string") {
        return payload.message;
      }
    }

    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocorreu um erro inesperado.";
}

export function SettingsAccessScreen() {
  const { data, isLoading, error } = useSettingsAccessOverview();
  const createInvitation = useCreateTeamInvitation();
  const revokeInvitation = useRevokeTeamInvitation();
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [form, setForm] = useState<InvitationFormState>({
    email: "",
    roleCode: "",
    unitIds: [],
    expiresInDays: 7,
    note: "",
  });

  useEffect(() => {
    if (!data) {
      return;
    }

    setForm((current) => {
      const nextRoleCode = current.roleCode || data.roles[0]?.code || "";
      const nextUnitIds = current.unitIds.length > 0 ? current.unitIds : data.units.map((unit) => unit.id);

      const sameRole = nextRoleCode === current.roleCode;
      const sameUnits =
        nextUnitIds.length === current.unitIds.length &&
        nextUnitIds.every((unitId, index) => current.unitIds[index] === unitId);

      if (sameRole && sameUnits) {
        return current;
      }

      return {
        ...current,
        roleCode: nextRoleCode,
        unitIds: nextUnitIds,
      };
    });
  }, [data]);

  const canManageAccess = data?.canManageAccess ?? false;
  const memberCount = data?.members.length ?? 0;
  const pendingInvitationCount = data?.pendingInvitations.length ?? 0;
  const adminCount =
    data?.members.filter((member) => ["owner", "admin", "manager"].includes(member.appRoleCode)).length ?? 0;

  const handleUnitToggle = (unitId: string) => {
    setForm((current) => ({
      ...current,
      unitIds: current.unitIds.includes(unitId)
        ? current.unitIds.filter((value) => value !== unitId)
        : [...current.unitIds, unitId],
    }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);

    try {
      await createInvitation.mutateAsync({
        email: form.email.trim(),
        roleCode: form.roleCode,
        unitIds: form.unitIds,
        expiresInDays: form.expiresInDays,
        note: form.note.trim() || undefined,
      });

      startTransition(() => {
        setForm((current) => ({
          ...current,
          email: "",
          note: "",
          unitIds: data?.units.map((unit) => unit.id) ?? current.unitIds,
        }));
      });

      setFeedback({
        tone: "success",
        message: "Convite criado e registrado no tenant atual.",
      });
    } catch (mutationError) {
      setFeedback({
        tone: "danger",
        message: extractErrorMessage(mutationError),
      });
    }
  };

  const handleRevoke = async (invitationId: string) => {
    setFeedback(null);

    try {
      await revokeInvitation.mutateAsync(invitationId);
      setFeedback({
        tone: "success",
        message: "Convite revogado com sucesso.",
      });
    } catch (mutationError) {
      setFeedback({
        tone: "danger",
        message: extractErrorMessage(mutationError),
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuracoes"
        description="Equipe, papeis e convites agora passam pelo backend de acesso do tenant atual."
      />

      <div className="grid gap-4 xl:grid-cols-4">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tenant</p>
          <h2 className="mt-3 text-lg font-semibold text-slate-950">
            {data?.tenant.tradeName || data?.tenant.legalName || "Carregando"}
          </h2>
          <p className="mt-2 text-sm text-slate-500">{data?.tenant.defaultTimezone ?? "Sem timezone"}</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Equipe</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{memberCount}</p>
          <p className="mt-2 text-sm text-slate-500">Memberships ativas, convidadas ou suspensas.</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Convites</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{pendingInvitationCount}</p>
          <p className="mt-2 text-sm text-slate-500">Pendencias abertas para o tenant atual.</p>
        </Card>

        <Card>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Lideranca</p>
          <p className="mt-3 text-3xl font-semibold text-slate-950">{adminCount}</p>
          <p className="mt-2 text-sm text-slate-500">Owner, admin e manager mapeados no tenant.</p>
        </Card>
      </div>

      {feedback ? (
        <Card
          className={
            feedback.tone === "danger"
              ? "border border-red-200 bg-red-50"
              : "border border-emerald-200 bg-emerald-50"
          }
        >
          <p className={feedback.tone === "danger" ? "text-sm text-red-700" : "text-sm text-emerald-700"}>
            {feedback.message}
          </p>
        </Card>
      ) : null}

      {!canManageAccess ? (
        <Card>
          <h2 className="text-base font-semibold text-slate-950">Acesso em modo consulta</h2>
          <p className="mt-2 text-sm text-slate-500">
            Seu perfil consegue visualizar equipe e papeis, mas nao pode emitir nem revogar convites.
          </p>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-950">Equipe ativa e historico recente</h2>
              <p className="mt-2 text-sm text-slate-500">
                Visao consolidada de memberships, papel aplicado e escopo por unidade.
              </p>
            </div>
            <Badge tone={canManageAccess ? "success" : "default"}>
              {canManageAccess ? "Gerencia habilitada" : "Somente leitura"}
            </Badge>
          </div>

          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Usuario</TableHeaderCell>
                  <TableHeaderCell>Papel</TableHeaderCell>
                  <TableHeaderCell>Unidades</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Ultimo acesso</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-slate-500">
                      Carregando equipe...
                    </TableCell>
                  </TableRow>
                ) : null}

                {!isLoading && data?.members.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-slate-500">
                      Nenhuma membership encontrada para o tenant atual.
                    </TableCell>
                  </TableRow>
                ) : null}

                {!isLoading
                  ? data?.members.map((member) => (
                      <TableRow key={member.membershipId}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-950">{member.fullName}</p>
                            <p className="text-xs text-slate-500">{member.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-slate-950">{member.roleName}</p>
                            <p className="text-xs uppercase tracking-wide text-slate-500">
                              {member.appRoleCode}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {member.units.map((unit) => (
                              <Badge key={`${member.membershipId}-${unit.id}`} tone={unit.isPrimary ? "success" : "default"}>
                                {unit.name}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge tone={toneForStatus(member.status)}>{labelForStatus(member.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-slate-500">
                          {formatDateTime(member.lastSeenAt || member.joinedAt)}
                        </TableCell>
                      </TableRow>
                    ))
                  : null}
              </TableBody>
            </Table>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold text-slate-950">Novo convite</h2>
          <p className="mt-2 text-sm text-slate-500">
            O convite herda o tenant atual e registra o escopo de unidades no Supabase.
          </p>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="invite-email">
                E-mail
              </label>
              <Input
                id="invite-email"
                placeholder="equipe@clinica.com"
                type="email"
                value={form.email}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                disabled={!canManageAccess || createInvitation.isPending}
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="invite-role">
                Papel
              </label>
              <select
                id="invite-role"
                className="field-base"
                value={form.roleCode}
                onChange={(event) => setForm((current) => ({ ...current, roleCode: event.target.value }))}
                disabled={!canManageAccess || createInvitation.isPending}
              >
                {(data?.roles ?? []).map((role) => (
                  <option key={role.id} value={role.code}>
                    {role.name} ({role.appRoleCode})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Escopo de unidades</label>
              <div className="space-y-2 rounded-2xl border border-border p-3">
                {(data?.units ?? []).map((unit) => (
                  <label key={unit.id} className="flex items-center gap-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={form.unitIds.includes(unit.id)}
                      onChange={() => handleUnitToggle(unit.id)}
                      disabled={!canManageAccess || createInvitation.isPending}
                    />
                    <span>{unit.name}</span>
                    {unit.isDefault ? <Badge tone="success">Padrao</Badge> : null}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="invite-expiration">
                  Expira em dias
                </label>
                <Input
                  id="invite-expiration"
                  min={1}
                  max={30}
                  type="number"
                  value={String(form.expiresInDays)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      expiresInDays: Number(event.target.value || "7"),
                    }))
                  }
                  disabled={!canManageAccess || createInvitation.isPending}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="invite-note">
                  Observacao
                </label>
                <Input
                  id="invite-note"
                  placeholder="Ex.: atendimento clinico e retorno"
                  value={form.note}
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  disabled={!canManageAccess || createInvitation.isPending}
                />
              </div>
            </div>

            <Button disabled={!canManageAccess || createInvitation.isPending || form.unitIds.length === 0} type="submit">
              {createInvitation.isPending ? "Criando convite..." : "Emitir convite"}
            </Button>
          </form>
        </Card>
      </div>

      <Card>
        <h2 className="text-base font-semibold text-slate-950">Convites pendentes</h2>
        <p className="mt-2 text-sm text-slate-500">
          Estado atual dos convites criados no tenant. O aceite ponta a ponta ainda depende do corte final da auth legada.
        </p>

        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>E-mail</TableHeaderCell>
                <TableHeaderCell>Papel</TableHeaderCell>
                <TableHeaderCell>Expira em</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Acoes</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-slate-500">
                    Carregando convites...
                  </TableCell>
                </TableRow>
              ) : null}

              {!isLoading && data?.pendingInvitations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-slate-500">
                    Nenhum convite pendente neste momento.
                  </TableCell>
                </TableRow>
              ) : null}

              {!isLoading
                ? data?.pendingInvitations.map((invitation) => (
                    <TableRow key={invitation.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-950">{invitation.email}</p>
                          <p className="text-xs text-slate-500">
                            Criado em {formatDateTime(invitation.createdAt)}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-slate-950">{invitation.roleName}</p>
                          <p className="text-xs uppercase tracking-wide text-slate-500">
                            {invitation.appRoleCode}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500">{formatDateTime(invitation.expiresAt)}</TableCell>
                      <TableCell>
                        <Badge tone={toneForStatus(invitation.status)}>{labelForStatus(invitation.status)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!canManageAccess || revokeInvitation.isPending}
                          onClick={() => handleRevoke(invitation.id)}
                        >
                          Revogar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                : null}
            </TableBody>
          </Table>
        </div>
      </Card>

      {error ? (
        <Card className="border border-red-200 bg-red-50">
          <p className="text-sm text-red-700">Falha ao carregar configuracoes: {extractErrorMessage(error)}</p>
        </Card>
      ) : null}
    </div>
  );
}
