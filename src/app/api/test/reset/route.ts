import { NextResponse } from 'next/server';
import { resetDb } from '@/db';
import { seedBase } from '@/db/queries';
import { testGuard } from '@/lib/test-guard';

export const dynamic = 'force-dynamic';

/** Wipes the DB, re-applies migrations and seeds the base data (admin / 1234). */
export async function POST() {
  const blocked = testGuard();
  if (blocked) return blocked;
  const db = await resetDb();
  const admin = await seedBase(db);
  return NextResponse.json({ ok: true, adminId: admin.id });
}
