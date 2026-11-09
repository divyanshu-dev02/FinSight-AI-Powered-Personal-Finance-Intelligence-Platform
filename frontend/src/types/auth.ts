export interface User {
  id: string;
  email: string;
  displayName: string;
  baseCurrency: string;
  timeZone: string;
  locale: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: User;
}

