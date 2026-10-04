'use client';

import { useState } from 'react';
import { Ellipsis } from 'lucide-react';
import { useAction } from '@/components/use-action';
import { actionErrorMessage } from '@/lib/action-timeout';
import { removeUserAction, resetPinAction, setAdminAction } from '../actions';

export interface PlayerRow {
  id: number;
  firstName: string;
  username: string;
  isAdmin: boolean;
}

const btn = 'h-10 rounded-lg border-[1.5px] border-border bg-surface-2 px-3 text-sm font-semibold text-fg disabled:opacity-60';

function Player({ u, isMe }: { u: PlayerRow; isMe: boolean }) {
  const [mode, setMode] = useState<'none' | 'pin' | 'remove'>('none');
  const [menu, setMenu] = useState(false);
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { pending, run: start, call } = useAction();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText?: string, after?: () => void) =>
    start(async () => {
      setMsg(null);
      try {
        const res = await call(fn());
        if (res.ok) {
          if (okText) setMsg({ ok: true, text: okText });
          after?.();
        } else setMsg({ ok: false, text: res.error ?? 'Something went wrong.' });
      } catch (e) {
        setMsg({ ok: false, text: actionErrorMessage(e, 'Something went wrong. Please try again.') });
      }
    });

  const item = 'block w-full px-4 py-3 text-left text-base text-fg hover:bg-surface-2';

  return (
    <li data-testid={`player-${u.username}`} className="border-b border-border px-3 py-2 last:border-b-0">
      <div className="flex min-h-12 items-center gap-2">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{u.firstName}</span>
          {u.isAdmin && (
            <span className="ml-2 rounded bg-accent/20 px-1.5 py-0.5 text-xs font-bold text-accent-bright">ADMIN</span>
          )}
          <div className="truncate text-sm text-muted">@{u.username}</div>
        </div>
        <button
          type="button"
          className={btn}
          onClick={() => {
            setMode(mode === 'pin' ? 'none' : 'pin');
            setPin('');
            setMsg(null);
            setMenu(false);
          }}
        >
          Reset PIN
        </button>
        {!isMe && (
          <div className="relative">
            <button
              type="button"
              aria-label={`More actions for ${u.firstName}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
              className="flex size-10 items-center justify-center rounded-lg hover:bg-surface-2"
            >
              <Ellipsis size={20} aria-hidden="true" />
            </button>
            {menu && (
              <div role="menu" className="absolute right-0 top-11 z-10 w-48 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
                <button
                  type="button"
                  role="menuitem"
                  className={item}
                  onClick={() => {
                    setMenu(false);
                    run(() => setAdminAction(u.id, !u.isAdmin), u.isAdmin ? `${u.firstName} is no longer an admin.` : `${u.firstName} is now an admin.`);
                  }}
                >
                  {u.isAdmin ? 'Remove admin' : 'Make admin'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={`${item} text-[#ff9c9c]`}
                  onClick={() => {
                    setMenu(false);
                    setMode('remove');
                    setMsg(null);
                  }}
                >
                  Remove player
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {mode === 'pin' && (
        <form
          className="flex items-end gap-2 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => resetPinAction(u.id, pin), `PIN reset for ${u.firstName}.`, () => {
              setMode('none');
              setPin('');
            });
          }}
        >
          <label className="flex-1 text-sm text-muted">
            New PIN for {u.firstName}
            <input
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="h-11 w-full rounded-[10px] border border-border bg-surface-2 px-3 text-fg"
            />
          </label>
          <button type="submit" disabled={pending || pin.length !== 4} className="h-11 rounded-lg bg-accent px-4 text-sm font-bold text-on-accent disabled:opacity-60">
            Save PIN
          </button>
        </form>
      )}

      {mode === 'remove' && (
        <div role="alertdialog" aria-label={`Remove ${u.firstName}`} className="mb-2 rounded-xl border border-wrong/50 bg-wrong/10 p-3">
          <p className="text-sm">
            Remove {u.firstName} (@{u.username})? They can no longer sign in and are dropped from the open week. Results
            from past weeks stay as they were, and the username stays reserved.
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeUserAction(u.id))}
              className="h-10 rounded-lg bg-wrong px-3 text-sm font-bold text-white disabled:opacity-60"
            >
              Confirm remove
            </button>
            <button type="button" disabled={pending} onClick={() => setMode('none')} className={btn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={`pb-1 text-sm ${msg.ok ? 'text-[#8ff0bc]' : 'text-[#ff9c9c]'}`}>
          {msg.text}
        </p>
      )}
    </li>
  );
}

export default function PlayersList({ meId, users }: { meId: number; users: PlayerRow[] }) {
  return (
    <ul className="rounded-xl border border-border bg-surface">
      {users.map((u) => (
        <Player key={u.id} u={u} isMe={u.id === meId} />
      ))}
    </ul>
  );
}
