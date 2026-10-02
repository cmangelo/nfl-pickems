'use client';

import { useActionState } from 'react';
import { changePinAction } from './actions';

const input =
  'h-[52px] w-full rounded-[10px] border-[1.5px] border-border bg-surface px-3.5 text-lg tracking-[0.4em] text-fg outline-none focus:border-accent';

const FIELDS = [
  ['currentPin', 'Current PIN', 'current-password'],
  ['newPin', 'New PIN', 'new-password'],
  ['confirmPin', 'Confirm new PIN', 'new-password'],
] as const;

export default function ChangePinForm() {
  const [state, action, pending] = useActionState(changePinAction, {});
  return (
    <form action={action} key={state.success ? 'done' : 'form'} className="flex flex-col gap-4">
      {FIELDS.map(([name, text, ac]) => (
        <div key={name}>
          <label htmlFor={name} className="mb-1.5 block text-sm font-semibold">
            {text}
          </label>
          <input
            id={name}
            name={name}
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete={ac}
            required
            className={input}
          />
        </div>
      ))}
      {state.error && (
        <p role="alert" data-testid="pin-error" className="rounded-lg bg-wrong/15 px-3 py-2.5 text-sm text-wrong">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" data-testid="pin-success" className="rounded-lg bg-accent/15 px-3 py-2.5 text-sm text-accent-bright">
          PIN updated.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="flex h-[54px] items-center justify-center rounded-xl bg-accent text-lg font-bold text-on-accent disabled:opacity-60"
      >
        Update PIN
      </button>
    </form>
  );
}
