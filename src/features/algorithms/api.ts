import { handleUnauthorized, handleNetworkError, getDirectApiUrl } from "../../core/http";

export type AlgorithmWekaOption = {
  flag: string;           // e.g., "C", "M", "N"
  description: string;    // e.g., "Confidence factor for pruning"
  type: string;           // e.g., "numeric", "boolean", "string"
  defaultValue: string;   // e.g., "0.25", "2", "true"
};

export type AlgorithmWeka = {
  id: number;
  name: string;
  description?: string;
  options?: AlgorithmWekaOption[];
  defaultOptionsString?: string;
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

export type UpdateCustomAlgorithmPayload = {
  name: string;
  description: string;
  version: string;
  accessibility: AlgorithmAccessibility;
  keywords: string[];
};

export type SearchCustomAlgorithmRequest = {
  simpleSearchInput?: string;  // Simple search - searches all fields
  name?: string;               // Advanced search fields
  description?: string;
  keywords?: string[];
  accessibility?: AlgorithmAccessibility;
  createdAtFrom?: string;
  createdAtTo?: string;
  searchMode?: "AND" | "OR";
};

export type SearchAlgorithmRequest = {
  keyword?: string;
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

export async function fetchAlgorithmWithOptions(id: number): Promise<AlgorithmWeka> {
  try {
    const res = await fetch(`/api/algorithms/weka/${id}/options`, {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed to load algorithm options (${res.status})`);
    }

    return res.json() as Promise<AlgorithmWeka>;
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

    // Use direct backend URL to bypass Vite proxy for large file uploads
    const directApiUrl = getDirectApiUrl();
    const url = `${directApiUrl}/api/algorithms/createCustomAlgorithm`;

    const res = await fetch(url, {
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

export async function getCustomAlgorithmById(
  id: number,
  token?: string
): Promise<CustomAlgorithm> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`/api/algorithms/${id}`, {
      method: "GET",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed to load algorithm (${res.status})`);
    }

    return res.json() as Promise<CustomAlgorithm>;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function searchCustomAlgorithms(
  request: SearchCustomAlgorithmRequest,
  token?: string
): Promise<CustomAlgorithm[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch("/api/algorithms/search-custom-algorithms", {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed to search custom algorithms (${res.status})`);
    }

    return res.json() as Promise<CustomAlgorithm[]>;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function searchAlgorithms(
  request: SearchAlgorithmRequest,
  token?: string
): Promise<AlgorithmWeka[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Backend expects inputSearch as form parameter
    const params = new URLSearchParams();
    if (request.keyword) {
      params.append("inputSearch", request.keyword);
    }

    const res = await fetch("/api/algorithms/search-weka-algorithms", {
      method: "POST",
      headers,
      body: params.toString()
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed to search predefined algorithms (${res.status})`);
    }

    return res.json() as Promise<AlgorithmWeka[]>;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function updateCustomAlgorithm(
  id: number,
  payload: UpdateCustomAlgorithmPayload,
  token?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`/api/algorithms/custom/update/${id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(payload)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const isJson = res.headers.get("Content-Type")?.includes("application/json");
      const body = isJson ? await res.json() : null;
      const message = body?.message || body?.errorCode || `Failed to update algorithm (${res.status})`;
      throw new Error(message);
    }
    await res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteCustomAlgorithm(id: number, token?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`/api/algorithms/custom/delete/${id}`, {
      method: "DELETE",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const isJson = res.headers.get("Content-Type")?.includes("application/json");
      const body = isJson ? await res.json() : null;
      const message = body?.message || body?.errorCode || `Failed to delete algorithm (${res.status})`;
      throw new Error(message);
    }

    // Consume the response body to prevent hanging
    await res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
