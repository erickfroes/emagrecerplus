import { http } from "@/lib/http";
import type { CommercialCatalogResponse } from "@/types/api";

export async function getCommercialCatalog() {
  return http<CommercialCatalogResponse>("/leads/catalog");
}
