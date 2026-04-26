import {
  Bell,
  Briefcase,
  CalendarDays,
  FileText,
  FilePenLine,
  LayoutDashboard,
  ListTodo,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { PermissionKey } from "@/types/auth";

export type SidebarItemConfig = {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: PermissionKey;
};

export const sidebarItems: SidebarItemConfig[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "dashboard:view" },
  { href: "/notifications", label: "Notificacoes", icon: Bell, permission: "notifications:view" },
  { href: "/patients", label: "Pacientes", icon: Users, permission: "patients:view" },
  { href: "/schedule", label: "Agenda", icon: CalendarDays, permission: "schedule:view" },
  { href: "/crm", label: "CRM", icon: Briefcase, permission: "crm:view" },
  { href: "/clinical/encounters/1", label: "Atendimento Clinico", icon: FilePenLine, permission: "clinical:view" },
  { href: "/clinical/documents", label: "Documentos", icon: FileText, permission: "clinical:view" },
  { href: "/clinical/document-layout", label: "Editor documental", icon: FilePenLine, permission: "clinical:view" },
  { href: "/clinical/tasks", label: "Tarefas", icon: ListTodo, permission: "clinical:view" },
  { href: "/settings", label: "Configuracoes", icon: Settings, permission: "settings:view" },
];

export const appTagline = "Administracao clinica, agenda e relacionamento em um so lugar.";
