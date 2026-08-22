const PRODUCTION_HOSTNAME = "brideprice.classesforculture.com";
const DEFAULT_PRODUCTION_ORIGIN = `https://${PRODUCTION_HOSTNAME}`;
const localHostnames = new Set(["localhost", "127.0.0.1", "[::1]"]);
const regionKeys = new Set(["west", "east", "central", "north", "south"]);

export type PublicAppEnvironment = "production" | "development" | "test";
export type PublicAppOrigin = string & { readonly __publicAppOrigin: unique symbol };
export type ApprovedPublicQuery = Readonly<{
  edition?: "west" | "east" | "central" | "north" | "south";
  nominated?: "1";
}>;

declare const __WYBP_PUBLIC_APP_ORIGIN__: string | undefined;
declare const __WYBP_RUNTIME_ENV__: PublicAppEnvironment | undefined;

function configurationError(reason: string): Error {
  return new Error(`Invalid PUBLIC_APP_ORIGIN: ${reason}`);
}

function isLocalHostname(hostname: string): boolean {
  return localHostnames.has(hostname.toLowerCase());
}

export function validatePublicAppOrigin(
  value: string,
  environment: PublicAppEnvironment,
): PublicAppOrigin {
  const candidate = value.trim();
  if (!candidate) throw configurationError("a non-empty absolute URL is required.");
  if (candidate.startsWith("//") || candidate.startsWith("\\\\")) {
    throw configurationError("protocol-relative URLs are not permitted.");
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw configurationError("the value must be a well-formed absolute URL.");
  }

  if (url.username || url.password) {
    throw configurationError("credentials are not permitted.");
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw configurationError("only an origin is permitted; remove paths, queries and fragments.");
  }

  if (environment === "production") {
    if (url.protocol !== "https:") {
      throw configurationError("production requires HTTPS.");
    }
    if (url.hostname.toLowerCase() !== PRODUCTION_HOSTNAME) {
      throw configurationError(`production hostname must be ${PRODUCTION_HOSTNAME}.`);
    }
    if (url.port) {
      throw configurationError("production does not permit a non-default port.");
    }
  } else if (isLocalHostname(url.hostname)) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw configurationError("local development requires HTTP or HTTPS.");
    }
  } else {
    if (url.protocol !== "https:" || url.hostname.toLowerCase() !== PRODUCTION_HOSTNAME || url.port) {
      throw configurationError(
        `development and tests may use only local origins or ${DEFAULT_PRODUCTION_ORIGIN}.`,
      );
    }
  }

  return url.origin as PublicAppOrigin;
}

export function resolvePublicAppOrigin(
  configuredValue: string | undefined,
  environment: PublicAppEnvironment,
): PublicAppOrigin {
  return validatePublicAppOrigin(configuredValue || DEFAULT_PRODUCTION_ORIGIN, environment);
}

const injectedEnvironment =
  typeof __WYBP_RUNTIME_ENV__ === "string" ? __WYBP_RUNTIME_ENV__ : "production";
const injectedOrigin =
  typeof __WYBP_PUBLIC_APP_ORIGIN__ === "string" ? __WYBP_PUBLIC_APP_ORIGIN__ : undefined;

export const PUBLIC_APP_ORIGIN: PublicAppOrigin = resolvePublicAppOrigin(
  injectedOrigin,
  injectedEnvironment,
);

export function resolveBrowserPublicAppOrigin(currentOrigin: string): PublicAppOrigin {
  let currentUrl: URL;
  try {
    currentUrl = new URL(currentOrigin);
  } catch {
    throw configurationError("the browser origin is malformed.");
  }
  if (currentUrl.username || currentUrl.password || currentUrl.pathname !== "/" || currentUrl.search || currentUrl.hash) {
    throw configurationError("the browser origin must contain only a scheme and host.");
  }
  return isLocalHostname(currentUrl.hostname)
    ? validatePublicAppOrigin(currentOrigin, "development")
    : PUBLIC_APP_ORIGIN;
}

function validatePublicPathname(pathname: string): void {
  if (
    !pathname.startsWith("/") ||
    pathname.startsWith("//") ||
    pathname.includes("\\") ||
    pathname.includes("?") ||
    pathname.includes("#")
  ) {
    throw configurationError("public paths must be same-origin absolute paths without a query or fragment.");
  }
}

function appendApprovedQuery(url: URL, query: ApprovedPublicQuery): void {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (key === "edition" && regionKeys.has(value)) {
      url.searchParams.set(key, value);
      continue;
    }
    if (key === "nominated" && value === "1") {
      url.searchParams.set(key, value);
      continue;
    }
    throw configurationError(`query parameter ${key} is not approved.`);
  }
}

export function createPublicAppUrl(
  pathname = "/",
  query: ApprovedPublicQuery = {},
  origin: PublicAppOrigin = PUBLIC_APP_ORIGIN,
): string {
  validatePublicPathname(pathname);
  const url = new URL(pathname, `${origin}/`);
  if (url.origin !== origin) {
    throw configurationError("public paths cannot override the configured origin.");
  }
  appendApprovedQuery(url, query);
  return url.toString();
}
