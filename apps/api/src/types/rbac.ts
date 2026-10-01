export type AuthenticatedAdmin = {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  sessionId: string;
  roles: string[];
  permissions: string[];
};
