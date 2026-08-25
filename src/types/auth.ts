export interface AuthUser {
  email: string;
  name: string;
  domain: string;
  loginAt: string;
  role: 'admin' | 'colaborador';
  provider?: 'google' | 'email_pin' | 'password';
}
