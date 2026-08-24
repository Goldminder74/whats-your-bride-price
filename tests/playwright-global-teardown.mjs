export default async function stopManagedPreviewServer() {
  try {
    await fetch("http://127.0.0.1:3100/__preview__/shutdown", { method: "POST" });
  } catch {
    // The preview server may already have stopped after a failed or interrupted run.
  }
}
