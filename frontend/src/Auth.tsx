import { useState, type FormEvent } from 'react';
import { request, type User } from './api';

type Props = { onLogin: (token: string, user: User) => void };

export function Auth({ onLogin }: Props) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset' | 'confirm'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('admin@brightloop.demo');
  const [password, setPassword] = useState('DemoAdmin!1');
  const [resetToken, setResetToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'login') {
        const response = await request('auth/login', '', { method: 'POST', body: JSON.stringify({ email, password }) });
        onLogin(response.access_token, response.user);
      } else if (mode === 'register') {
        await request('auth/register', '', { method: 'POST', body: JSON.stringify({ name, email, password }) });
        setMode('login'); setMessage('Account created. Sign in.');
      } else if (mode === 'reset') {
        await request('auth/password-resets', '', { method: 'POST', body: JSON.stringify({ email }) });
        setMode('confirm'); setMessage('Reset requested. Find the demo link in the staff outbox.');
      } else {
        await request('auth/password-resets/confirm', '', { method: 'POST', body: JSON.stringify({ token: resetToken, new_password: password }) });
        setMode('login'); setMessage('Password changed. Sign in.');
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="auth"><form className="panel" onSubmit={submit}>
    <span className="eyebrow">Brightloop Software</span><h1>{mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Set new password'}</h1>
    {mode === 'register' && <label>Name<input required value={name} onChange={event => setName(event.target.value)} /></label>}
    {mode !== 'confirm' && <label>Email<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>}
    {mode === 'confirm' && <label>Reset token<input required value={resetToken} onChange={event => setResetToken(event.target.value)} /></label>}
    {mode !== 'reset' && <label>Password<input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>}
    {error && <p className="error" role="alert">{error}</p>}{message && <p className="notice" role="status">{message}</p>}
    <button className="primary" disabled={busy}>{busy ? 'Working…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Request reset' : 'Change password'}</button>
    <div className="auth-links"><button type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create account' : 'Back to sign in'}</button>{mode === 'login' && <button type="button" onClick={() => setMode('reset')}>Forgot password</button>}</div>
  </form></div>;
}
