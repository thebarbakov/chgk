const normalizeBaseUrl = (value?: string) => {
  const fallback = "http://localhost:4000";
  if (!value) return fallback;
  const trimmed = value.trim();
  return trimmed.replace(/\/+$/, "") || fallback;
};

export const API_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_API_BASE);
export const MEDIA_BASE_URL = normalizeBaseUrl(process.env.NEXT_PUBLIC_MEDIA_BASE || API_BASE_URL);
const toWssUrl = (url: string) =>
  url.replace(/^http:/i, "wss:").replace(/^https:/i, "wss:").replace(/^ws:/i, "wss:");

const envWsUrl = process.env.NEXT_PUBLIC_WS_URL?.trim();
export const WS_URL = envWsUrl ? toWssUrl(envWsUrl) : `${toWssUrl(API_BASE_URL)}/ws`;

type HeadersShape = Record<string, string>;
export type ApiRequestOptions = RequestInit & { json?: unknown };

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class ApiClient {
  protected baseUrl: string;
  protected defaults: RequestInit;

  constructor(baseUrl: string, defaults: RequestInit = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.defaults = defaults;
  }

  protected buildUrl(path: string) {
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    return `${this.baseUrl}${cleanPath}`;
  }

  protected mergeHeaders(defaults?: HeadersInit, override?: HeadersInit): HeadersShape {
    const toObject = (init?: HeadersInit): HeadersShape => {
      if (!init) return {};
      if (init instanceof Headers) return Object.fromEntries(init.entries());
      if (Array.isArray(init)) return Object.fromEntries(init);
      return { ...init };
    };
    return { ...toObject(defaults), ...toObject(override) };
  }

  async request<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const { json, ...rest } = options;
    const headers = this.mergeHeaders(this.defaults.headers, rest.headers);

    let body: BodyInit | undefined = rest.body as BodyInit | undefined;
    if (json !== undefined) {
      body = JSON.stringify(json);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }

    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    if (!json && rest.body && typeof rest.body === "object" && !isFormData && typeof rest.body !== "string") {
      body = JSON.stringify(rest.body);
      if (!headers["Content-Type"]) headers["Content-Type"] = "application/json";
    }

    if (isFormData && headers["Content-Type"]) {
      delete headers["Content-Type"]; // allow the browser to set the boundary
    }

    const response = await fetch(this.buildUrl(path), {
      ...this.defaults,
      ...rest,
      headers,
      body,
    });

    if (!response.ok) {
      const message = (await response.text()) || response.statusText;
      throw new ApiError(message, response.status);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) return (await response.json()) as T;
    if (response.status === 204) return undefined as T;
    return (await response.text()) as unknown as T;
  }
}

export class GamesApi extends ApiClient {
  constructor(baseUrl = API_BASE_URL) {
    super(`${baseUrl}/api`);
  }

  getActiveGames() {
    return this.request<{ id: number; gameDate: string; location: string; pinCode: string }[]>("/games/active");
  }

  getTeamsStatus(gameId: number | string) {
    return this.request<{ id: number; name: string; locked?: boolean }[]>(`/games/${gameId}/teams/status`);
  }

  getSectors(gameId: number | string) {
    return this.request(`/games/${gameId}/sectors`);
  }

  releaseTeam(gameId: number | string, teamId: number | string) {
    return this.request(`/games/${gameId}/teams/${teamId}/release`, { method: "POST" });
  }
}

type AdminApiOptions = { onUnauthorized?: () => void };

export class AdminApi extends ApiClient {
  private readonly onUnauthorized?: () => void;

  constructor(baseUrl: string | AdminApiOptions = API_BASE_URL, options: AdminApiOptions = {}) {
    const resolvedBaseUrl = typeof baseUrl === "string" ? baseUrl : API_BASE_URL;
    const resolvedOptions = typeof baseUrl === "string" ? options : baseUrl;
    super(`${resolvedBaseUrl}/api/admin`, { credentials: "include" });
    this.onUnauthorized = resolvedOptions.onUnauthorized;
  }

  override async request<T>(path: string, options: ApiRequestOptions = {}) {
    try {
      return await super.request<T>(path, options);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && this.onUnauthorized) {
        this.onUnauthorized();
      }
      throw err;
    }
  }

  login(payload: { login: string; password: string }) {
    return this.request("/login", { method: "POST", json: payload });
  }

  logout() {
    return this.request("/logout", { method: "POST" });
  }
}

export const gamesApi = new GamesApi(API_BASE_URL);
