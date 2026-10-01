// Placeholder: real auth lands in Phase 1.
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="text-3xl font-bold text-accent-bright">NFL Pick&apos;em</h1>
      <form className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-muted">
          Username
          <input
            name="username"
            autoComplete="username"
            autoCapitalize="none"
            className="rounded-lg border border-border bg-surface px-3 py-3 text-base text-fg outline-none focus:border-accent"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted">
          PIN
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            maxLength={4}
            autoComplete="current-password"
            className="rounded-lg border border-border bg-surface px-3 py-3 text-base text-fg outline-none focus:border-accent"
          />
        </label>
        <button type="submit" className="rounded-lg bg-accent px-3 py-3 font-semibold text-bg">
          Log in
        </button>
      </form>
    </main>
  );
}
