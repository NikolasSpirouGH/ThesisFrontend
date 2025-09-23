import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type AlgorithmWeka = {
  id: number;
  name: string;
};

export type AlgorithmAccessibility = "PUBLIC" | "PRIVATE" | "SHARED";

export type CustomAlgorithm = {
  id: number;
  name: string;
  description: string | null;
  version: string;
  accessibility: AlgorithmAccessibility;
  ownerUsername: string;
  isOwner: boolean;
  keywords: string[];
  createdAt: string;
};

export type CreateCustomAlgorithmPayload = {
  name: string;
  description: string;
  version: string;
  accessibility: AlgorithmAccessibility;
  keywords: string[];
  parametersFile: File;
  dockerTarFile?: File;
  dockerHubUrl?: string;
};

type GenericResponse<T> = {
  dataHeader: T;
  message: string;
  errorCode: string;
  metadata: unknown;
};

export async function fetchAlgorithms(): Promise<AlgorithmWeka[]> {
  try {
    const res = await fetch("/api/algorithms/get-algorithms", {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed to load algorithms (${res.status})`);
    }

    return res.json() as Promise<AlgorithmWeka[]>;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function createCustomAlgorithm(
  payload: CreateCustomAlgorithmPayload,
  token?: string
): Promise<number> {
  try {
    const form = new FormData();
    form.append("name", payload.name);
    if (payload.description) {
      form.append("description", payload.description);
    }
    form.append("version", payload.version);
    form.append("accessibility", payload.accessibility);
    form.append("parametersFile", payload.parametersFile);

    payload.keywords.forEach((keyword) => {
      form.append("keywords", keyword);
    });

    if (payload.dockerTarFile) {
      form.append("dockerTarFile", payload.dockerTarFile);
    }
    if (payload.dockerHubUrl) {
      form.append("dockerHubUrl", payload.dockerHubUrl);
    }

    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch("/api/algorithms/createCustomAlgorithm", {
      method: "POST",
      headers,
      body: form
    });

    handleUnauthorized(res);

    const isJson = res.headers.get("Content-Type")?.includes("application/json");
    const body = isJson ? ((await res.json()) as GenericResponse<number>) : null;

    if (!res.ok) {
      const message = body?.message || body?.errorCode || `Failed to create algorithm (${res.status})`;
      throw new Error(message);
    }

    if (!body) {
      throw new Error("Unexpected response from server");
    }

    return body.dataHeader;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function fetchCustomAlgorithms(token?: string): Promise<CustomAlgorithm[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch("/api/algorithms/get-custom-algorithms", {
      method: "GET",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed to load custom algorithms (${res.status})`);
    }

    return res.json() as Promise<CustomAlgorithm[]>;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
