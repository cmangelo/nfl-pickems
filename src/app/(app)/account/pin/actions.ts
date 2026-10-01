'use server';

import { changePin, requireUser } from '@/lib/auth';

export interface PinState {
  error?: string;
  success?: boolean;
}

export async function changePinAction(_prev: PinState, formData: FormData): Promise<PinState> {
  const user = await requireUser();
  const current = String(formData.get('currentPin') ?? '');
  const next = String(formData.get('newPin') ?? '');
  const confirm = String(formData.get('confirmPin') ?? '');
  if (next !== confirm) return { error: 'New PINs do not match.' };
  const res = await changePin(user, current, next);
  return res.ok ? { success: true } : { error: res.error };
}
