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
  finishedAt: string | null;
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
