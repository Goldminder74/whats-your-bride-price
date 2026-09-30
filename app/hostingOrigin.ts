/** Public, build-time configuration. Never contains runtime credentials. */
export type HostingOrigin = Readonly<{ environment: "test" | "production"; origin: string }>;

export function validateHostingOrigin(configuration: HostingOrigin): string {
  const { environment, origin } = configuration;
  const url = new URL(origin);
  if (url.origin !== origin || url.protocol !== "https:" || url.username || url.password
    || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error("Invalid hosting origin");
  if (environment === "production") {
    if (origin !== "https://classesforculture.com") throw new Error("Invalid future production origin");
  } else if (environment === "test") {
    // A fixed project address only; deploy aliases and wildcard domains are not trusted.
    if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.netlify\.app$/.test(url.hostname)
      || url.hostname.includes("--")) throw new Error("Invalid fixed Netlify test origin");
  } else throw new Error("Invalid hosting environment");
  return origin;
}
