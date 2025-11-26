export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  departmentId: string | null;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
  departmentId: string | null;
}
