import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type ModelItem = {
  id: number;
  name: string | null;
  description: string | null;
  dataDescription: string | null;
  trainingId: number;
  algorithmName: string | null;
  datasetName: string | null;
  modelType: string | null;
  algorithmType: string | null;
  status: string;
  accessibility: string;
  categoryName: string | null;
  categoryId: number | null;
  keywords: string[] | null;
  createdAt: string | null;
  finalizationDate: string | null;
  finalized: boolean;
  ownerUsername: string;
};

export type CategoryItem = {
  id: number;
  name: string;
  description: string | null;
  createdByUsername: string;
  parentCategoryIds: number[] | null;
};

export type FinalizeModelRequest = {
  name: string;
  description: string;
  dataDescription: string;
  categoryId: number;
  keywords: string[];
  isPublic: boolean;
};

export type UpdateModelRequest = {
  name: string;
  description: string;
  dataDescription: string;
  categoryId: number;
  keywords: string[];
  isPublic: boolean;
};

export type SearchModelRequest = {
  simpleSearchInput?: string;
  name?: string;
  description?: string;
  keywords?: string[];
  category?: string;
  accessibility?: string;
  modelType?: string;
  createdAtFrom?: string;
  createdAtTo?: string;
  searchMode?: "AND" | "OR";
};

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function normaliseError(res: Response, fallback: string): Promise<string> {
  handleUnauthorized(res);
  const body = await res.text().catch(() => "");
  return body || res.statusText || fallback;
}

export async function fetchModels(token?: string): Promise<ModelItem[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/models", { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load models");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function fetchCategories(token?: string): Promise<CategoryItem[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/categories", { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load categories");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function finalizeModel(
  modelId: number,
  request: FinalizeModelRequest,
  token?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/models/${modelId}/model`, {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to finalize model");
      throw new Error(`${res.status}: ${message}`);
    }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function getModelById(
  modelId: number,
  token?: string
): Promise<ModelItem> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/models/${modelId}`, { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load model");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function updateModel(
  modelId: number,
  request: UpdateModelRequest,
  token?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/models/${modelId}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to update model");
      throw new Error(`${res.status}: ${message}`);
    }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteModel(
  modelId: number,
  token?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      ...authHeader(token)
    };

    const res = await fetch(`/api/models/${modelId}`, {
      method: "DELETE",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to delete model");
      throw new Error(`${res.status}: ${message}`);
    }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function searchModels(
  request: SearchModelRequest,
  token?: string
): Promise<ModelItem[]> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/models/search", {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to search models");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
