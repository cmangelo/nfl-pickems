for (const f of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(f);
  } catch {
    // file missing: fine
  }
}
