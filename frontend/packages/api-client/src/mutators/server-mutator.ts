import Axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { cookies } from "next/headers";

// Bearer-authenticated instance for Server Components / Route Handlers /
// Server Actions — see docs/architecture/05-auth-flow.md, Diagram E.
// API_URL (not NEXT_PUBLIC_API_URL) — the Next.js server calls Django over
// the internal Docker network (e.g. http://backend:8000), while the browser
// uses the host-facing NEXT_PUBLIC_API_URL. Falls back to
// NEXT_PUBLIC_API_URL for local dev outside Docker, where there's only one
// origin for both. See frontend/Dockerfile and docker-compose.yml.
export const AXIOS_INSTANCE = Axios.create({
  baseURL: process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL,
});

export const serverMutator = async <T>(
  config: AxiosRequestConfig,
  options?: AxiosRequestConfig,
): Promise<T> => {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("access_token")?.value;

  const source = Axios.CancelToken.source();
  const { data } = await AXIOS_INSTANCE({
    ...config,
    ...options,
    cancelToken: source.token,
    headers: {
      ...config.headers,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });

  return data as T;
};

export type ErrorType<Error> = AxiosError<Error>;
