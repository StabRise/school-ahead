import Axios, { type AxiosError, type AxiosRequestConfig, type AxiosResponse } from "axios";

// Cookie-authenticated instance for Client Components — see
// docs/architecture/05-auth-flow.md and 06-frontend-architecture.md.
export const AXIOS_INSTANCE = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  withCredentials: true,
});

const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

// Double-submit CSRF: attach the JS-readable csrf_token cookie as a header
// on every mutating request (05-auth-flow.md's CSRF section).
AXIOS_INSTANCE.interceptors.request.use((config) => {
  const method = config.method?.toLowerCase();
  if (method && MUTATING_METHODS.has(method)) {
    const csrfToken = readCookie("csrf_token");
    if (csrfToken) {
      config.headers.set("X-CSRF-Token", csrfToken);
    }
  }
  return config;
});

// A single in-flight refresh is shared across concurrent 401s so a burst of
// requests doesn't trigger a burst of refresh calls / token rotations.
let refreshPromise: Promise<unknown> | null = null;

type RetriableConfig = AxiosRequestConfig & { _retried?: boolean };

AXIOS_INSTANCE.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && originalRequest && !originalRequest._retried) {
      originalRequest._retried = true;
      try {
        refreshPromise ??= AXIOS_INSTANCE.post("/api/auth/refresh").finally(() => {
          refreshPromise = null;
        });
        await refreshPromise;
        return AXIOS_INSTANCE(originalRequest);
      } catch {
        // Refresh failed — fall through and reject with the original 401.
      }
    }

    return Promise.reject(error);
  },
);

export const browserMutator = <T>(config: AxiosRequestConfig, options?: AxiosRequestConfig): Promise<T> => {
  const source = Axios.CancelToken.source();
  const promise = AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
  }).then(({ data }: AxiosResponse<T>) => data);

  return promise;
};

export type ErrorType<Error> = AxiosError<Error>;
