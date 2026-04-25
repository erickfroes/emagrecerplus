import { supabaseAdmin } from "../../lib/supabase-admin.ts";

type RuntimeEncounterOverlayParams = {
  legacyTenantId: string;
  legacyEncounterId: string;
};

type AutosaveEncounterSectionParams = RuntimeEncounterOverlayParams & {
  section: "anamnesis" | "soap_draft";
  payload: Record<string, unknown>;
  legacyActorUserId?: string | null;
  savedAt?: string | null;
  metadata?: Record<string, unknown>;
};

type RuntimeAnamnesisDraft = {
  id?: string | null;
  chiefComplaint?: string | null;
  historyOfPresentIllness?: string | null;
  pastMedicalHistory?: string | null;
  lifestyleHistory?: string | null;
  notes?: string | null;
};

type RuntimeSoapDraft = {
  id?: string | null;
  noteType?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  signedAt?: string | null;
};

type AutosaveEncounterSectionResult = {
  section: "anamnesis" | "soap_draft";
  encounterId: string;
  legacyEncounterId: string;
  savedAt: string;
  source: string;
  anamnesis?: RuntimeAnamnesisDraft | null;
  soapDraft?: RuntimeSoapDraft | null;
};

export type RuntimeEncounterAutosaveOverlay = {
  anamnesis: RuntimeAnamnesisDraft | null;
  soapDraft: RuntimeSoapDraft | null;
};

async function callRpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, args);

  if (error) {
    throw new Error(`Falha ao executar RPC ${name}: ${error.message}`);
  }

  return data as T;
}

function assertAutosaveEncounterSectionResult(
  result: Record<string, unknown>
): AutosaveEncounterSectionResult {
  if (
    (result.section !== "anamnesis" && result.section !== "soap_draft") ||
    typeof result.encounterId !== "string" ||
    typeof result.legacyEncounterId !== "string" ||
    typeof result.savedAt !== "string" ||
    typeof result.source !== "string"
  ) {
    throw new Error("RPC autosave_encounter_section retornou payload incompleto.");
  }

  return {
    section: result.section,
    encounterId: result.encounterId,
    legacyEncounterId: result.legacyEncounterId,
    savedAt: result.savedAt,
    source: result.source,
    anamnesis:
      result.anamnesis && typeof result.anamnesis === "object" && !Array.isArray(result.anamnesis)
        ? (result.anamnesis as RuntimeAnamnesisDraft)
        : null,
    soapDraft:
      result.soapDraft && typeof result.soapDraft === "object" && !Array.isArray(result.soapDraft)
        ? (result.soapDraft as RuntimeSoapDraft)
        : null,
  };
}

export async function autosaveRuntimeEncounterSection(
  params: AutosaveEncounterSectionParams
): Promise<AutosaveEncounterSectionResult> {
  const result = await callRpc<Record<string, unknown>>("autosave_encounter_section", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_section: params.section,
    p_payload: params.payload,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_saved_at: params.savedAt ?? null,
    p_metadata: params.metadata ?? {},
  });

  return assertAutosaveEncounterSectionResult(result);
}

export async function getRuntimeEncounterAutosaveOverlay(
  params: RuntimeEncounterOverlayParams
): Promise<RuntimeEncounterAutosaveOverlay> {
  const result = await callRpc<Record<string, unknown>>("get_encounter_autosave_overlay", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
  });

  return {
    anamnesis:
      result.anamnesis && typeof result.anamnesis === "object" && !Array.isArray(result.anamnesis)
      ? {
          id: String((result.anamnesis as Record<string, unknown>).id ?? ""),
          chiefComplaint:
            typeof (result.anamnesis as Record<string, unknown>).chiefComplaint === "string"
              ? ((result.anamnesis as Record<string, unknown>).chiefComplaint as string)
              : null,
          historyOfPresentIllness:
            typeof (result.anamnesis as Record<string, unknown>).historyOfPresentIllness === "string"
              ? ((result.anamnesis as Record<string, unknown>).historyOfPresentIllness as string)
              : null,
          pastMedicalHistory:
            typeof (result.anamnesis as Record<string, unknown>).pastMedicalHistory === "string"
              ? ((result.anamnesis as Record<string, unknown>).pastMedicalHistory as string)
              : null,
          lifestyleHistory:
            typeof (result.anamnesis as Record<string, unknown>).lifestyleHistory === "string"
              ? ((result.anamnesis as Record<string, unknown>).lifestyleHistory as string)
              : null,
          notes:
            typeof (result.anamnesis as Record<string, unknown>).notes === "string"
              ? ((result.anamnesis as Record<string, unknown>).notes as string)
              : null,
        }
      : null,
    soapDraft:
      result.soapDraft && typeof result.soapDraft === "object" && !Array.isArray(result.soapDraft)
      ? {
          id: String((result.soapDraft as Record<string, unknown>).id ?? ""),
          noteType:
            typeof (result.soapDraft as Record<string, unknown>).noteType === "string"
              ? ((result.soapDraft as Record<string, unknown>).noteType as string)
              : null,
          subjective:
            typeof (result.soapDraft as Record<string, unknown>).subjective === "string"
              ? ((result.soapDraft as Record<string, unknown>).subjective as string)
              : null,
          objective:
            typeof (result.soapDraft as Record<string, unknown>).objective === "string"
              ? ((result.soapDraft as Record<string, unknown>).objective as string)
              : null,
          assessment:
            typeof (result.soapDraft as Record<string, unknown>).assessment === "string"
              ? ((result.soapDraft as Record<string, unknown>).assessment as string)
              : null,
          plan:
            typeof (result.soapDraft as Record<string, unknown>).plan === "string"
              ? ((result.soapDraft as Record<string, unknown>).plan as string)
              : null,
          signedAt:
            typeof (result.soapDraft as Record<string, unknown>).signedAt === "string"
              ? ((result.soapDraft as Record<string, unknown>).signedAt as string)
              : null,
        }
      : null,
  };
}

export async function clearRuntimeEncounterSoapDraft(params: RuntimeEncounterOverlayParams) {
  await callRpc("clear_encounter_soap_draft", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
  });
}
