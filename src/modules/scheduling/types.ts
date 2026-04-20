export type AppointmentStatus = "Agendado" | "Confirmado" | "Concluído" | "No-show";

export type AppointmentItem = {
  id: string;
  dateTimeLabel: string;
  patient: string;
  type: string;
  professional: string;
  room: string;
  status: AppointmentStatus;
};
