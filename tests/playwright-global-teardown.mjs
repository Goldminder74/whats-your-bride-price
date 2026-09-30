export default async function stopManagedPreviewServer() {
  try {
    await fetch("http://127.0.0.1:3100/__preview__/shutdown", { method: "POST" });
  } catch {
    // The preview server may already have stopped after a failed or interrupted run.
    return;
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    try {
      await fetch("http://127.0.0.1:3100/__preview__/health", {
        signal: AbortSignal.timeout(100),
      });
    } catch {
      // Let Windows release the exited process's imported build files before the next build.
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }
  }

  throw new Error("The managed Playwright preview server did not stop cleanly.");
}
