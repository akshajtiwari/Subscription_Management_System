import { useId, useState, type FormEvent } from 'react';
import { ApiError, request, type User } from './api';
import { ErrorBox } from './ui';
import { Icon } from './Icon';

type Props = { onLogin: (token: string, user: User) => void; initialResetToken?: string };
type Mode = 'login' | 'register' | 'reset' | 'confirm';

export function Auth({ onLogin, initialResetToken = '' }: Props) {
  const passwordId = useId();
  const [mode, setMode] = useState<Mode>(initialResetToken ? 'confirm' : 'login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const rules = [
    ['More than eight characters', password.length > 8],
    ['An uppercase letter', /\p{Lu}/u.test(password)],
    ['A lowercase letter', /\p{Ll}/u.test(password)],
    ['A special character', /[^\p{L}\p{N}\s]/u.test(password)],
  ] as const;
  function changeMode(next: Mode) {
    setMode(next);
    setError('');
    setMessage('');
    setShow(false);
    if (next !== 'login') setPassword('');
    if (next === 'register') setEmail('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        const response = await request('auth/login', '', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        onLogin(response.access_token, response.user);
      } else if (mode === 'register') {
        await request('auth/register', '', {
          method: 'POST',
          body: JSON.stringify({ name, email, password }),
        });
        setMode('login');
        setMessage('Account created. Sign in.');
      } else if (mode === 'reset') {
        await request('auth/password-resets', '', {
          method: 'POST',
          body: JSON.stringify({ email }),
        });
        setMode('confirm');
        setMessage('Reset requested. Find the link in the demo outbox.');
      } else {
        await request('auth/password-resets/confirm', '', {
          method: 'POST',
          body: JSON.stringify({ token: resetToken, new_password: password }),
        });
        const url = new URL(location.href);
        url.searchParams.delete('reset_token');
        history.replaceState(null, '', url);
        setMode('login');
        setMessage('Password changed. Sign in.');
      }
    } catch (cause) {
      setError(
        (cause as Error).message +
          (cause instanceof ApiError && cause.fields.length
            ? ` ${cause.fields.map((field) => `${field.field}: ${field.message}`).join(' ')}`
            : ''),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <div className="auth-brand">
          <strong>brightloop</strong>
        </div>
        <div>
          <span className="auth-kicker">One connected billing workspace</span>
          <h1>
            Every renewal
            <br />
            accounted for.
          </h1>
          <p>See plans, invoices, payments, and upcoming renewals in one place.</p>
          <div className="auth-steps">
            <span>01 Set a plan</span>
            <span>02 Start a subscription</span>
            <span>03 Keep billing on track</span>
          </div>
        </div>
      </section>
      <section className="auth-content">
        <div className="authstage">
          <div className="eyebrow">Secure access</div>
          <h1>
            {mode === 'login'
              ? 'Sign in'
              : mode === 'register'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Reset password'
                  : 'Set new password'}
          </h1>
          <p className="muted">
            {mode === 'login'
              ? 'Email, password, forgot password link.'
              : mode === 'register'
                ? 'Name, email, password and password rules.'
                : mode === 'reset'
                  ? 'Registered email and recovery instructions.'
                  : 'New password and confirmation.'}
          </p>
          <div className="panel">
            <form className="formgrid" noValidate onSubmit={submit}>
              <ErrorBox error={error} focus />
              {mode === 'register' && (
                <div className="field">
                  <label htmlFor="auth-name">Name</label>
                  <input
                    id="auth-name"
                    placeholder="Name"
                    autoComplete="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={busy}
                  />
                </div>
              )}
              {mode !== 'confirm' && (
                <div className="field">
                  <label htmlFor="auth-email">Email</label>
                  <input
                    id="auth-email"
                    placeholder="Email"
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={busy}
                  />
                </div>
              )}
              {mode === 'confirm' && (
                <label>
                  Reset token
                  <input
                    value={resetToken}
                    onChange={(event) => setResetToken(event.target.value)}
                    disabled={busy}
                  />
                </label>
              )}
              {mode !== 'reset' && (
                <div className="field auth-password-field">
                  <label htmlFor={passwordId}>Password</label>
                  <div className="password-control">
                    <input
                      id={passwordId}
                      placeholder="Password"
                      type={show ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      disabled={busy}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={show ? 'Hide password' : 'Show password'}
                      aria-pressed={show}
                      onClick={() => setShow(!show)}
                    >
                      {show ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              )}
              {['register', 'confirm'].includes(mode) && (
                <ul className="password-rules" aria-label="Password requirements">
                  {rules.map(([rule, valid]) => (
                    <li key={rule} data-valid={valid}>
                      <span aria-hidden="true">{valid ? '✓' : '○'}</span>
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
              {message && (
                <p className="notice" role="status">
                  {message}
                </p>
              )}
              <button className="btn primary" disabled={busy}>
                {busy
                  ? 'Working…'
                  : mode === 'login'
                    ? 'Sign in'
                    : mode === 'register'
                      ? 'Create account'
                      : mode === 'reset'
                        ? 'Request reset'
                        : 'Change password'}{' '}
                <Icon name="arrow" />
              </button>
            </form>
            <div className="actions auth-links" style={{ marginTop: 18 }}>
              <button
                className="btn"
                type="button"
                disabled={busy}
                onClick={() => changeMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? 'Create account' : 'Back to sign in'}
              </button>
              {mode === 'login' && (
                <button
                  className="btn"
                  type="button"
                  disabled={busy}
                  onClick={() => changeMode('reset')}
                >
                  Forgot password
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
