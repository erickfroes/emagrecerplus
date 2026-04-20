import { useAuthStore } from "@/state/auth-store";

export function usePermissions() {
  const hasPermission = useAuthStore((state) => state.hasPermission);

  return {
    can: hasPermission,
  };
}