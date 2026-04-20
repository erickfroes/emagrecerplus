export type DashboardStat = {
  label: string;
  value: number;
  helper?: string;
};

export type DashboardAppointment = {
  id: string;
  time: string;
  patient: string;
  type: string;
  professional: string;
  status: "scheduled" | "confirmed" | "completed" | "no_show";
};

export type DashboardAlert = {
  id: string;
  title: string;
  description: string;
};

export type DashboardSummary = {
  stats: DashboardStat[];
  appointments: DashboardAppointment[];
  alerts: DashboardAlert[];
};
