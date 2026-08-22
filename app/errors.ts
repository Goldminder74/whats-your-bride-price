export type AppErrorCode =
  | "route_render_failed"
  | "photo_read_failed"
  | "result_export_failed"
  | "share_failed";

export type AppErrorContext = Readonly<Record<string, string | number | boolean>>;

export function reportAppError(
  code: AppErrorCode,
  error: unknown,
  context: AppErrorContext = {},
): void {
  const message = error instanceof Error ? error.message : "Unknown application error";
  console.error("Bride Price game error", { code, message, context });
}
