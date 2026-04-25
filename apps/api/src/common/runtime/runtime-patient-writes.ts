import { supabaseAdmin } from "../../lib/supabase-admin.ts";

type UpsertRuntimePatientFromLegacyParams = {
  legacyTenantId: string;
  legacyPatientId: string;
  fullName: string;
  cpf?: string | null;
  birthDate?: string | null;
  primaryPhone?: string | null;
  primaryEmail?: string | null;
  goalsSummary?: string | null;
  lifestyleSummary?: string | null;
  legacyCreatedByUserId?: string | null;
  metadata?: Record<string, unknown>;
};

type UpsertRuntimePatientFromLegacyResult = {
  id: string;
  legacyPatientId: string;
  referenceId: string;
  source: string;
};

export async function upsertRuntimePatientFromLegacy(
  params: UpsertRuntimePatientFromLegacyParams
): Promise<UpsertRuntimePatientFromLegacyResult> {
  const { data, error } = await supabaseAdmin.rpc("upsert_runtime_patient_from_legacy", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_patient_id: params.legacyPatientId,
    p_full_name: params.fullName,
    p_cpf: params.cpf ?? null,
    p_birth_date: params.birthDate ?? null,
    p_primary_phone: params.primaryPhone ?? null,
    p_primary_email: params.primaryEmail ?? null,
    p_goals_summary: params.goalsSummary ?? null,
    p_lifestyle_summary: params.lifestyleSummary ?? null,
    p_legacy_created_by_user_id: params.legacyCreatedByUserId ?? null,
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(`Falha ao executar RPC upsert_runtime_patient_from_legacy: ${error.message}`);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("RPC upsert_runtime_patient_from_legacy nao retornou um objeto valido.");
  }

  const result = data as Record<string, unknown>;

  if (
    typeof result.id !== "string" ||
    typeof result.legacyPatientId !== "string" ||
    typeof result.referenceId !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error("RPC upsert_runtime_patient_from_legacy retornou payload incompleto.");
  }

  return {
    id: result.id,
    legacyPatientId: result.legacyPatientId,
    referenceId: result.referenceId,
    source: result.source,
  };
}
