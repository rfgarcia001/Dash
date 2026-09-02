import React, { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import { fetchMe } from './services/api';
import type { AuthUser } from './types/auth';

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false);
  // Independente do Google estar ligado — Basic Auth também tem um papel
  // (via DASHBOARD_ADMIN_EMAILS), e criar/apagar funil precisa saber disso
  // pra esconder os botões de quem não é admin, em qualquer modo de login.
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetchMe()
      .then((me) => {
        setGoogleLoginEnabled(me.googleLoginEnabled);
        setIsAdmin(me.role === 'admin');
        // Basic Auth (sem Google) não expõe identidade de sessão pra
        // renderizar o menu de perfil — só liga o authUser quando o login
        // via Google está habilitado no servidor.
        if (!me.googleLoginEnabled) return;
        setAuthUser({
          email: me.email,
          name: me.email.split('@')[0],
          domain: me.email.split('@')[1] || '',
          loginAt: new Date().toISOString(),
          role: me.role === 'admin' ? 'admin' : 'colaborador',
          provider: 'google'
        });
      })
      .catch(() => { /* Basic Auth puro, ou /api/me indisponível — segue sem menu de perfil */ });
  }, []);

  return (
    <Dashboard
      authUser={authUser}
      isAdmin={isAdmin}
      onLogout={googleLoginEnabled ? () => { window.location.href = '/auth/logout'; } : undefined}
    />
  );
}
