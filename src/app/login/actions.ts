'use server';

import { redirect } from 'next/navigation';
import { login, logout, signUp, startSession } from '@/lib/auth';

export interface FormState {
  error?: string;
}

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const res = await login(String(formData.get('username') ?? ''), String(formData.get('pin') ?? ''));
  if (!res.ok) return { error: res.error };
  await startSession(res.user.id);
  redirect('/');
}

export async function signUpAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const res = await signUp(
    String(formData.get('firstName') ?? ''),
    String(formData.get('username') ?? ''),
    String(formData.get('pin') ?? ''),
  );
  if (!res.ok) return { error: res.error };
  await startSession(res.user.id);
  redirect('/');
}

export async function logoutAction() {
  await logout();
  redirect('/login');
}
