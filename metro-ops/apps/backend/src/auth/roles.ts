export type UserRole = "DRIVER" | "DISPATCHER" | "ADMIN";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: UserRole;
}

export const ROLE_ORDER: Record<UserRole, number> = {
  DRIVER: 1,
  DISPATCHER: 2,
  ADMIN: 3,
};
