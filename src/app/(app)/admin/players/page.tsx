import { requireAdmin } from '@/lib/auth';
import { listUsers } from '@/lib/admin';
import PlayersList from './PlayersList';

export default async function AdminPlayersPage() {
  const me = await requireAdmin();
  const users = await listUsers();
  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">Players</h1>
      <PlayersList
        meId={me.id}
        users={users.map((u) => ({ id: u.id, firstName: u.firstName, username: u.username, isAdmin: u.isAdmin }))}
      />
    </div>
  );
}
