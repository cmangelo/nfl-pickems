'use client';

import { useState } from 'react';
import { useAction } from '@/components/use-action';
import { actionErrorMessage } from '@/lib/action-timeout';
import { changePinAction, type PinState } from './actions';

const input =
  'h-[52px] w-full rounded-[10px] border-[1.5px] border-border bg-surface px-3.5 text-lg tracking-[0.4em] text-fg outline-none focus:border-accent';

const FIELDS = [
  ['currentPin', 'Current PIN', 'current-password'],
  ['newPin', 'New PIN', 'new-password'],
  ['confirmPin', 'Confirm new PIN', 'new-password'],
] as const;

export default function ChangePinForm() {
  // Not useActionState / <form action>: those run in a transition, which would hold back every navigation until
  // the request settles (see use-action.ts).
  const [state, setState] = useState<PinState>({});
  const { pending, run, call } = useAction();
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    run(async () => {
      try {
        setState(await call(changePinAction(state, data)));
      } catch (err) {
        setState({ error: actionErrorMessage(err, 'Something went wrong. Please try again.') });
      }
      form.reset(); // PINs are never left in the fields, as a form action would do
    });
  };
  return (
    <form onSubmit={onSubmit} key={state.success ? 'done' : 'form'} className="flex flex-col gap-4">
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
