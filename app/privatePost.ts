/** Relative, credentialed private-site POST; WebKit must send the real Origin. */
export function privatePostOptions(body: unknown, signal?: AbortSignal): RequestInit {
  return { method: "POST", mode: "cors", credentials: "same-origin", redirect: "error",
    referrerPolicy: "no-referrer", cache: "no-store", headers: { "content-type": "application/json" },
    body: JSON.stringify(body), ...(signal ? { signal } : {}) };
}
