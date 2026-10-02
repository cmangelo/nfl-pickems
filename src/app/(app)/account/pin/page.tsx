import { requireUser } from '@/lib/auth';
import ChangePinForm from './ChangePinForm';

export default async function ChangePinPage() {
  await requireUser(); // layouts are skipped on partial renders: every page enforces auth itself
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Change PIN</h1>
      <ChangePinForm />
    </div>
  );
}
