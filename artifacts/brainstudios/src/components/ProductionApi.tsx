import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@clerk/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { projectSchema, type Project } from "@workspace/video-workflow";
import { authEnabled } from "@/lib/auth";
type Api = {
  userId: string | null;
  loaded: boolean;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const Context = createContext<Api>({
  userId: null,
  loaded: true,
  request: async () => {
    throw new Error("Sign in to use real production services.");
  },
});
function AuthenticatedBridge({ children }: { children: ReactNode }) {
  const { userId, isLoaded } = useAuth();
  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const r = await fetch(`/api${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          ...init?.headers,
        },
      });
      const data = await r
        .json()
        .catch(() => ({ error: "The production server is unavailable." }));
      if (!r.ok) throw new Error(data.error || "The request could not finish.");
      return data;
    },
    [],
  );
  return (
    <Context.Provider
      value={{ userId: userId || null, loaded: isLoaded, request }}
    >
      {children}
    </Context.Provider>
  );
}
export function ProductionApiProvider({ children }: { children: ReactNode }) {
  return authEnabled ? (
    <AuthenticatedBridge>{children}</AuthenticatedBridge>
  ) : (
    children
  );
}
export function useRealProductions() {
  const api = useContext(Context),
    client = useQueryClient();
  const [pending, setPending] = useState(false);
  const key = ["video-productions", api.userId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      projectSchema.array().parse(await api.request("/videos")),
    enabled: !!api.userId,
    refetchInterval: (q) =>
      q.state.data?.some((p) =>
        p.jobs.some((j) =>
          ["queued", "running", "waiting", "retrying"].includes(j.status),
        ),
      )
        ? 5000
        : 30000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const config = useQuery({
    queryKey: ["video-service-config"],
    queryFn: async () => {
      const r = await fetch("/api/video/config");
      if (!r.ok) throw new Error("The production server is unavailable.");
      return r.json() as Promise<{ ready: boolean; missing: string[] }>;
    },
    retry: 1,
    staleTime: 60000,
  });
  useEffect(
    () => () => {
      client.removeQueries({ queryKey: ["video-productions", api.userId] });
    },
    [api.userId, client],
  );
  async function mutate(path: string, body: unknown, method = "POST") {
    setPending(true);
    try {
      const p = projectSchema.parse(
        await api.request(path, { method, body: JSON.stringify(body) }),
      );
      client.setQueryData<Project[]>(key, (old) => [
        p,
        ...(old || []).filter((v) => v.id !== p.id),
      ]);
      return p;
    } finally {
      setPending(false);
    }
  }
  return {
    ...api,
    projects: query.data || [],
    pending,
    loading: query.isLoading,
    error: query.error?.message,
    ready: config.data?.ready || false,
    configError: config.error?.message,
    mutate,
    refresh: query.refetch,
  };
}
