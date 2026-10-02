'use client';

import { useActionState, useState } from 'react';
import { loginAction, signUpAction } from './actions';

const input =
  'h-[52px] w-full rounded-[10px] border-[1.5px] border-border bg-surface px-3.5 text-lg text-fg outline-none placeholder:text-muted/60 focus:border-accent';
const label = 'mb-1.5 block text-sm font-semibold text-fg/90';

export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [loginState, loginFormAction, loginPending] = useActionState(loginAction, {});
  const [signUpState, signUpFormAction, signUpPending] = useActionState(signUpAction, {});
  // React resets uncontrolled inputs after an action; keep text fields controlled.
  const [firstName, setFirstName] = useState('');
  const [username, setUsername] = useState('');

  const isSignup = mode === 'signup';
  const state = isSignup ? signUpState : loginState;
  const pending = isSignup ? signUpPending : loginPending;

  return (
    <form
      action={isSignup ? signUpFormAction : loginFormAction}
      className="flex flex-1 flex-col gap-[18px] px-6 pb-6 pt-2"
    >
      <div role="tablist" aria-label="Log in or sign up" className="grid grid-cols-2 rounded-[10px] bg-surface-2 p-[3px]">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`h-10 rounded-lg text-base font-semibold ${
              mode === m ? 'bg-border text-fg' : 'text-muted'
            }`}
          >
            {m === 'login' ? 'Log in' : 'Sign up'}
          </button>
        ))}
      </div>

      {isSignup && (
        <div>
          <label className={label} htmlFor="firstName">
            First name
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            placeholder="Dan"
            maxLength={30}
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={input}
          />
          <p className="mt-1.5 text-[13px] text-muted">So the admins know who&apos;s who when collecting money.</p>
        </div>
      )}

      <div>
        <label className={label} htmlFor="username">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoCapitalize="none"
          autoCorrect="off"
          autoComplete="username"
          placeholder="dan_the_man"
          maxLength={20}
          required
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className={input}
        />
      </div>

      <div>
        <label className={label} htmlFor="pin">
          4-digit PIN
        </label>
        <input
          id="pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          placeholder="••••"
          required
          className={`${input} tracking-[0.4em]`}
        />
      </div>

      {state.error && (
        <p role="alert" data-testid="auth-error" className="rounded-lg bg-wrong/15 px-3 py-2.5 text-sm text-wrong">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="flex h-[54px] items-center justify-center rounded-xl bg-accent text-lg font-bold text-on-accent disabled:opacity-60"
      >
        {isSignup ? 'Create account' : 'Log in'}
      </button>
      <p className="text-center text-sm text-muted">Forgot your PIN? Ask an admin to reset it.</p>
      <p className="mt-auto text-center text-[13px] text-muted">You&apos;ll stay logged in on this phone.</p>
    </form>
  );
}
