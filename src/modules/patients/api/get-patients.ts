import { env } from "@/lib/env";
import { http } from "@/lib/http";
import type { PatientsListResponse } from "@/types/api";

export type PatientsListFilters = {
  search?: string;
  status?: string;
  tag?: string;
  flag?: string;
};

const fallbackPatients: PatientsListResponse = {
  items: [
    {
      id: "1",
      name: "Mariana Souza",
      phone: "(99) 99111-1111",
      email: "mariana.souza@email.com",
      status: "Ativa",
      tags: ["Emagrecimento", "VIP"],
      flags: ["vip_attention"],
      lastConsultation: "2026-04-14T09:00:00.000Z",
      nextAppointment: "2026-05-10T09:00:00.000Z",
    },
    {
      id: "2",
      name: "Paula Ribeiro",
      phone: "(99) 99222-2222",
      email: "paula.ribeiro@email.com",
      status: "Ativa",
      tags: ["Emagrecimento"],
      flags: ["no_show_recent"],
      lastConsultation: "2026-04-07T10:00:00.000Z",
      nextAppointment: null,
    },
    {
      id: "3",
      name: "Lucas Martins",
      phone: "(99) 99333-3333",
      email: "lucas.martins@email.com",
      status: "Ativo",
      tags: ["Hipertrofia"],
      flags: [],
      lastConsultation: "2026-04-16T17:00:00.000Z",
      nextAppointment: "2026-05-08T17:00:00.000Z",
    },
  ],
  total: 3,
  page: 1,
  pageSize: 20,
};

export async function getPatients(filters: PatientsListFilters = {}) {
  const search = filters.search?.trim().toLowerCase();
  const status = filters.status?.trim().toLowerCase();
  const tag = filters.tag?.trim().toLowerCase();
  const flag = filters.flag?.trim().toLowerCase();

  if (env.useMocks) {
    const filteredItems = fallbackPatients.items.filter((item) =>
      matchesPatientSearch(item, search) &&
      matchesPatientStatus(item.status, status) &&
      matchesPatientCollection(item.tags, tag) &&
      matchesPatientCollection(item.flags, flag)
    );

    return {
      ...fallbackPatients,
      items: filteredItems,
      total: filteredItems.length,
    };
  }

  const query = new URLSearchParams();

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  if (filters.tag) {
    query.set("tag", filters.tag);
  }

  if (filters.flag) {
    query.set("flag", filters.flag);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return http<PatientsListResponse>(`/patients${suffix}`);
}

function matchesPatientSearch(
  item: PatientsListResponse["items"][number],
  search?: string,
) {
  if (!search) {
    return true;
  }

  return [item.name, item.phone ?? "", item.email ?? ""].some((value) =>
    value.toLowerCase().includes(search)
  );
}

function matchesPatientStatus(statusLabel: string, status?: string) {
  if (!status) {
    return true;
  }

  const normalizedStatusLabel = statusLabel.toLowerCase();
  return normalizedStatusLabel.includes(status);
}

function matchesPatientCollection(values: string[], filter?: string) {
  if (!filter) {
    return true;
  }

  return values.some((value) => value.toLowerCase().includes(filter));
}
