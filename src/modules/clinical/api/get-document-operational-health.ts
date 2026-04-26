import { http } from "@/lib/http";

export type DocumentOperationalHealthStatus = "failure" | "ok" | "pending" | "warning";

export type DocumentOperationalHealthSummaryItem = {
  key: string;
  label: string;
  count: number;
  status: DocumentOperationalHealthStatus;
};

export type DocumentOperationalHealthEvent = Record<string, unknown> & {
  category?: string;
  documentId?: string;
  eventType?: string;
  healthStatus?: DocumentOperationalHealthStatus;
  message?: string | null;
  occurredAt?: string | null;
  patientName?: string | null;
  providerCode?: string | null;
  providerMode?: string | null;
  status?: string | null;
};

export type DocumentOperationalHealth = {
  generatedAt: string | null;
  overallStatus: DocumentOperationalHealthStatus;
  period: {
    from: string | null;
    to: string | null;
  };
  filters: {
    provider: string | null;
    status: string | null;
    limit: number;
  };
  summary: DocumentOperationalHealthSummaryItem[];
  counts: {
    dispatchFailed: number;
    webhookHmacFailed: number;
    webhookDuplicate: number;
    packageFailed: number;
    evidencePending: number;
    providerConfigMissing: number;
  };
  latestDispatches: DocumentOperationalHealthEvent[];
  latestWebhooks: DocumentOperationalHealthEvent[];
  recentFailures: DocumentOperationalHealthEvent[];
};

export type DocumentOperationalHealthParams = {
  periodFrom?: string;
  periodTo?: string;
  provider?: string;
  status?: string;
  limit?: number;
};

export async function getDocumentOperationalHealth(
  params: DocumentOperationalHealthParams = {},
) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();

  return http<DocumentOperationalHealth>(
    `/documents/ops/health${query ? `?${query}` : ""}`,
  );
}
