export function formatPatientAppDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem horario definido";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Sem horario definido";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(parsed);
}

export function formatPatientAppDate(value: string | null | undefined) {
  if (!value) {
    return "Sem data";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
}

export function describePatientCheckInMood(value: string | null | undefined) {
  switch (value) {
    case "great":
      return "Otimo";
    case "good":
      return "Bem";
    case "neutral":
      return "Neutro";
    case "bad":
      return "Mal";
    case "terrible":
      return "Pessimo";
    default:
      return "Sem humor informado";
  }
}

export function describeMealAdherence(score: number | null | undefined) {
  if (score == null) {
    return "Sem nota";
  }

  if (score >= 5) return "Excelente";
  if (score >= 4) return "Boa";
  if (score >= 3) return "Ok";
  if (score >= 2) return "Baixa";
  return "Ruim";
}

export function describeSymptomSeverity(score: number | null | undefined) {
  if (score == null) {
    return "Sem gravidade";
  }

  if (score >= 8) return "Alta";
  if (score >= 4) return "Moderada";
  if (score >= 1) return "Leve";
  return "Sem gravidade";
}

export function describeSleepQuality(score: number | null | undefined) {
  if (score == null) {
    return "Sem nota";
  }

  if (score >= 8) return "Muito boa";
  if (score >= 6) return "Boa";
  if (score >= 4) return "Regular";
  return "Ruim";
}

export function formatHours(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return "Sem dado";
  }

  return `${value.toFixed(1).replace(".", ",")}h`;
}

export function formatPatientAppActivityTitle(value: string | null | undefined) {
  if (!value) {
    return "Atualizacao recente";
  }

  return value;
}
