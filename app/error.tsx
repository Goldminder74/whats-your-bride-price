"use client";

import { useEffect } from "react";
import { reportAppError } from "./errors";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportAppError("route_render_failed", error, {
      digest: error.digest || "not-provided",
    });
  }, [error]);

  return (
    <main className="error-stage">
      <section role="alert">
        <p>THE STORY PAUSED</p>
        <h1>We lost the rhythm for a moment.</h1>
        <p>Your photo has not been uploaded. Try this screen again, or return safely to the beginning.</p>
        <div>
          <button type="button" onClick={reset}>Try again</button>
          <button type="button" className="error-home" onClick={() => window.location.assign("/")}>Return home</button>
        </div>
      </section>
    </main>
  );
}
