import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type CategoryDTO = {
  id: number;
  name: string;
  description: string | null;
  createdByUsername: string;
  parentCategoryIds: number[];
  deleted: boolean;
};

export type CategoryRequestDTO = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  requestedByUsername: string;
  processedByUsername: string | null;
  requestedAt: string;
  processedAt: string | null;
  rejectionReason: string | null;
  parentCategoryIds: number[];
};

export type CategoryCreateRequest = {
  name: string;
  description?: string;
  parentCategoryIds?: number[];
  force?: boolean;
};

export type CategoryUpdateRequest = {
  name?: string;
  description?: string;
  newParentCategoryIds?: number[];
  parentCategoryIdsToRemove?: number[];
};

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function normaliseError(res: Response, fallback: string): Promise<string> {
  handleUnauthorized(res);
  const body = await res.text().catch(() => "");
  return body || res.statusText || fallback;
}

export async function fetchCategories(token?: string): Promise<CategoryDTO[]> {
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

export async function createCategory(request: CategoryCreateRequest, token?: string): Promise<CategoryRequestDTO> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/categories/addCategory", {
      method: "POST",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to create category");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function updateCategory(
  categoryId: number,
  request: CategoryUpdateRequest,
  token?: string
): Promise<CategoryDTO> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/categories/${categoryId}/update`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to update category");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteCategory(categoryId: number, token?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/categories/${categoryId}/delete`, {
      method: "DELETE",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to delete category");
      throw new Error(`${res.status}: ${message}`);
    }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function approveCategoryRequest(requestId: number, token?: string): Promise<CategoryRequestDTO> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/categories/${requestId}/approve`, {
      method: "POST",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to approve category request");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function rejectCategoryRequest(
  requestId: number,
  rejectionReason: string,
  token?: string
): Promise<CategoryRequestDTO> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/categories/${requestId}/reject`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ rejectionReason })
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to reject category request");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
