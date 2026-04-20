import {
  AppointmentStatus,
  ClinicalTaskPriority,
  ClinicalTaskStatus,
  LeadStatus,
  RecordStatus,
  EncounterType,
} from "../../../../generated/prisma/client/enums.ts";

const locale = "pt-BR";
const timeZone = process.env.APP_TIMEZONE ?? "America/Araguaina";

const timeFormatter = new Intl.DateTimeFormat(locale, {
  hour: "2-digit",
  minute: "2-digit",
  timeZone,
});

const shortDateFormatter = new Intl.DateTimeFormat(locale, {
  day: "2-digit",
  month: "2-digit",
  timeZone,
});

const shortDateTimeFormatter = new Intl.DateTimeFormat(locale, {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone,
});

export function formatTime(value: Date) {
  return timeFormatter.format(value);
}

export function formatShortDate(value: Date) {
  return shortDateFormatter.format(value);
}

export function formatShortDateTime(value: Date) {
  return shortDateTimeFormatter.format(value).replace(",", "");
}

export function formatRelativeDateTime(value: Date) {
  const now = new Date();
  const diffMs = startOfDay(now).getTime() - startOfDay(value).getTime();
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays === 0) {
    return `Hoje, ${formatTime(value)}`;
  }

  if (diffDays === 1) {
    return `Ontem, ${formatTime(value)}`;
  }

  return `${formatShortDate(value)}, ${formatTime(value)}`;
}

export function mapDashboardAppointmentStatus(status: AppointmentStatus) {
  switch (status) {
    case AppointmentStatus.COMPLETED:
      return "completed";
    case AppointmentStatus.CONFIRMED:
      return "confirmed";
    case AppointmentStatus.NO_SHOW:
      return "no_show";
    default:
      return "scheduled";
  }
}

export function mapAppointmentStatusLabel(status: AppointmentStatus) {
  switch (status) {
    case AppointmentStatus.CONFIRMED:
      return "Confirmado";
    case AppointmentStatus.CHECKED_IN:
      return "Check-in";
    case AppointmentStatus.IN_PROGRESS:
      return "Em atendimento";
    case AppointmentStatus.COMPLETED:
      return "Concluido";
    case AppointmentStatus.CANCELLED:
      return "Cancelado";
    case AppointmentStatus.NO_SHOW:
      return "No-show";
    default:
      return "Agendado";
  }
}

export function mapRecordStatusLabel(status: RecordStatus) {
  switch (status) {
    case RecordStatus.INACTIVE:
      return "Inativo";
    case RecordStatus.ARCHIVED:
      return "Arquivado";
    default:
      return "Ativo";
  }
}

export function mapTaskPriorityLabel(priority: ClinicalTaskPriority) {
  switch (priority) {
    case ClinicalTaskPriority.HIGH:
    case ClinicalTaskPriority.URGENT:
      return "Alta";
    case ClinicalTaskPriority.LOW:
      return "Baixa";
    default:
      return "Media";
  }
}

export function mapTaskStatusLabel(status: ClinicalTaskStatus) {
  switch (status) {
    case ClinicalTaskStatus.IN_PROGRESS:
      return "Em andamento";
    case ClinicalTaskStatus.DONE:
      return "Concluida";
    case ClinicalTaskStatus.CANCELLED:
      return "Cancelada";
    default:
      return "Aberta";
  }
}

export function mapCarePlanStatusLabel(status?: string | null) {
  switch (status) {
    case "DONE":
      return "Concluido";
    case "OVERDUE":
      return "Atrasado";
    case "IN_PROGRESS":
    case "ACTIVE":
      return "Em andamento";
    case "PLANNED":
      return "Planejado";
    default:
      return "Em andamento";
  }
}

export function mapEncounterTypeLabel(encounterType: EncounterType) {
  switch (encounterType) {
    case "INITIAL_CONSULT":
      return "Consulta inicial";
    case "FOLLOW_UP":
      return "Retorno";
    case "TELECONSULT":
      return "Teleconsulta";
    case "PROCEDURE":
      return "Procedimento";
    case "REVIEW":
      return "Revisao";
    default:
      return "Atendimento";
  }
}

export function mapLeadStatusToStageCode(status: LeadStatus) {
  switch (status) {
    case LeadStatus.CONTACTED:
      return "contacted";
    case LeadStatus.QUALIFIED:
      return "qualified";
    case LeadStatus.APPOINTMENT_BOOKED:
      return "appointment_booked";
    case LeadStatus.PROPOSAL_SENT:
      return "proposal_sent";
    case LeadStatus.WON:
      return "won";
    case LeadStatus.LOST:
      return "lost";
    default:
      return "new";
  }
}

export function formatStageName(stageCode: string) {
  switch (stageCode) {
    case "contacted":
      return "Contatado";
    case "qualified":
      return "Qualificado";
    case "appointment_booked":
      return "Consulta Marcada";
    case "proposal_sent":
      return "Proposta Enviada";
    case "won":
      return "Fechado";
    case "lost":
      return "Perdido";
    default:
      return "Novo Lead";
  }
}

export function buildPipelineSummary(stageCodes: string[]) {
  const counts = {
    new: 0,
    qualified: 0,
    scheduled: 0,
    proposal: 0,
    closed: 0,
  };

  for (const stageCode of stageCodes) {
    switch (stageCode) {
      case "contacted":
      case "new":
        counts.new += 1;
        break;
      case "qualified":
        counts.qualified += 1;
        break;
      case "appointment_booked":
        counts.scheduled += 1;
        break;
      case "proposal_sent":
        counts.proposal += 1;
        break;
      case "won":
        counts.closed += 1;
        break;
      default:
        break;
    }
  }

  return [
    { code: "new", title: "Novo lead", count: counts.new },
    { code: "qualified", title: "Qualificado", count: counts.qualified },
    { code: "scheduled", title: "Consulta marcada", count: counts.scheduled },
    { code: "proposal", title: "Proposta", count: counts.proposal },
    { code: "closed", title: "Fechado", count: counts.closed },
  ];
}

export function humanizeCode(value?: string | null) {
  if (!value) {
    return null;
  }

  const dictionary: Record<string, string> = {
    google: "Google",
    instagram: "Instagram",
    meta_ads: "Meta Ads",
    body_modulation: "Modulacao corporal",
    weight_loss: "Emagrecimento",
    low_tolerance_report: "Baixa tolerancia",
    lunch: "Almoco",
    dinner: "Jantar",
    post_workout: "Pos-treino",
    walk: "Caminhada",
    strength_training: "Treino de forca",
    hunger_control: "Controle de fome",
    anxiety_eating: "Ansiedade alimentar",
  };

  if (dictionary[value]) {
    return dictionary[value];
  }

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function calculateAge(birthDate?: Date | null) {
  if (!birthDate) {
    return 0;
  }

  const now = new Date();
  let age = now.getFullYear() - birthDate.getFullYear();
  const monthDiff = now.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthDate.getDate())) {
    age -= 1;
  }

  return age;
}

export function formatDueDate(value?: Date | null) {
  if (!value) {
    return "Sem prazo";
  }

  if (isSameDay(value, new Date())) {
    return "Hoje";
  }

  return formatShortDate(value);
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}
