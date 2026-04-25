import { supabaseAdmin } from "../../lib/supabase-admin.ts";

export type RecordRuntimePrescriptionItemInput = {
  legacyPrescriptionItemId?: string | null;
  itemType?: string | null;
  title: string;
  dosage?: string | null;
  frequency?: string | null;
  route?: string | null;
  durationDays?: number | null;
  quantity?: number | null;
  unit?: string | null;
  instructions?: string | null;
  position?: number | null;
  metadata?: Record<string, unknown>;
};

export type RecordRuntimePrescriptionInput = {
  legacyTenantId: string;
  legacyEncounterId: string;
  legacyPrescriptionId?: string | null;
  prescriptionType: string;
  summary?: string | null;
  legacyIssuedByUserId?: string | null;
  issuedAt?: string | null;
  items?: RecordRuntimePrescriptionItemInput[];
  metadata?: Record<string, unknown>;
};

export type RecordRuntimePrescriptionResult = {
  id: string;
  runtimeId: string;
  prescriptionType: string;
  summary: string | null;
  issuedAt: string;
  items: Array<{
    id: string;
    runtimeId: string;
    itemType: string;
    title: string;
    dosage: string | null;
    frequency: string | null;
    route: string | null;
    durationDays: number | null;
    quantity: number | null;
    unit: string | null;
    instructions: string | null;
    position: number | null;
  }>;
};

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

export async function recordRuntimePrescription(
  params: RecordRuntimePrescriptionInput
): Promise<RecordRuntimePrescriptionResult> {
  const { data, error } = await supabaseAdmin.rpc("record_prescription_for_encounter", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_legacy_prescription_id: params.legacyPrescriptionId ?? null,
    p_prescription_type: params.prescriptionType,
    p_summary: params.summary ?? null,
    p_legacy_issued_by_user_id: params.legacyIssuedByUserId ?? null,
    p_issued_at: params.issuedAt ?? null,
    p_items: (params.items ?? []).map((item, index) => ({
      legacy_prescription_item_id: item.legacyPrescriptionItemId ?? null,
      item_type: item.itemType ?? null,
      title: item.title,
      dosage: item.dosage ?? null,
      frequency: item.frequency ?? null,
      route: item.route ?? null,
      duration_days: item.durationDays ?? null,
      quantity: item.quantity ?? null,
      unit: item.unit ?? null,
      instructions: item.instructions ?? null,
      position: item.position ?? index + 1,
      metadata: item.metadata ?? {},
    })),
    p_metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(`Falha ao executar RPC record_prescription_for_encounter: ${error.message}`);
  }

  assertRecord(data, "RPC record_prescription_for_encounter nao retornou um objeto valido.");

  if (
    typeof data.id !== "string" ||
    typeof data.runtimeId !== "string" ||
    typeof data.prescriptionType !== "string" ||
    typeof data.issuedAt !== "string" ||
    !Array.isArray(data.items)
  ) {
    throw new Error("RPC record_prescription_for_encounter retornou payload incompleto.");
  }

  return {
    id: data.id,
    runtimeId: data.runtimeId,
    prescriptionType: data.prescriptionType,
    summary: typeof data.summary === "string" ? data.summary : null,
    issuedAt: data.issuedAt,
    items: data.items
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object")
      .map((item) => ({
        id: String(item.id ?? ""),
        runtimeId: String(item.runtimeId ?? ""),
        itemType: String(item.itemType ?? "other"),
        title: String(item.title ?? ""),
        dosage: typeof item.dosage === "string" ? item.dosage : null,
        frequency: typeof item.frequency === "string" ? item.frequency : null,
        route: typeof item.route === "string" ? item.route : null,
        durationDays: typeof item.durationDays === "number" ? item.durationDays : null,
        quantity: typeof item.quantity === "number" ? item.quantity : null,
        unit: typeof item.unit === "string" ? item.unit : null,
        instructions: typeof item.instructions === "string" ? item.instructions : null,
        position: typeof item.position === "number" ? item.position : null,
      })),
  };
}
