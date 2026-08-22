import Axios, { type AxiosError, type AxiosRequestConfig } from "axios";
import { cookies } from "next/headers";

// Bearer-authenticated instance for Server Components / Route Handlers /
// Server Actions — see docs/architecture/05-auth-flow.md, Diagram E.
export const AXIOS_INSTANCE = Axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
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
