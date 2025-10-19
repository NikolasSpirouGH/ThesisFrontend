import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type DatasetDTO = {
  id: number;
  originalFileName: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  contentType: string;
  uploadDate: string;
  status: "PUBLIC" | "PRIVATE" | "SHARED";
  description: string | null;
  ownerUsername: string;
  completeTrainingCount: number;
  failedTrainingCount: number;
};

export type DatasetUploadRequest = {
  file: File;
  originalFileName?: string;
  fileName?: string;
  accessibility: "PUBLIC" | "PRIVATE" | "SHARED";
  description?: string;
  categoryId?: number;
  functionalType?: "TRAIN" | "TEST" | "VALIDATION";
};

export type DatasetSearchRequest = {
  name?: string;
  ownerUsername?: string;
  categoryId?: number;
  includeChildCategories?: boolean;
  isPublic?: boolean;
  contentType?: string;
  uploadDateFrom?: string;
  uploadDateTo?: string;
};

export type DatasetSearchResponse = {
  content: DatasetDTO[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function normaliseError(res: Response, fallback: string): Promise<string> {
  handleUnauthorized(res);
  const body = await res.text().catch(() => "");
  return body || res.statusText || fallback;
}

export async function fetchDatasets(token?: string): Promise<DatasetDTO[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/datasets", { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load datasets");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data || [];
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function searchDatasets(
  searchRequest: DatasetSearchRequest,
  page: number = 0,
  size: number = 10,
  sortBy: string = "uploadDate",
  sortDirection: string = "DESC",
  token?: string
): Promise<DatasetSearchResponse> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const params = new URLSearchParams({
      page: page.toString(),
      size: size.toString(),
      sortBy,
      sortDirection
    });

    const res = await fetch(`/api/datasets/search?${params}`, {
      method: "POST",
      headers,
      body: JSON.stringify(searchRequest)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to search datasets");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function uploadDataset(request: DatasetUploadRequest, token?: string): Promise<any> {
  try {
    const formData = new FormData();
    formData.append("file", request.file);

    if (request.originalFileName) {
      formData.append("originalFileName", request.originalFileName);
    }
    if (request.fileName) {
      formData.append("fileName", request.fileName);
    }
    formData.append("accessibility", request.accessibility);

    if (request.description) {
      formData.append("description", request.description);
    }
    if (request.categoryId) {
      formData.append("categoryId", request.categoryId.toString());
    }
    if (request.functionalType) {
      formData.append("functionalType", request.functionalType);
    }

    const headers: Record<string, string> = {
      ...authHeader(token)
    };

    const res = await fetch("/api/datasets/upload", {
      method: "POST",
      headers,
      body: formData
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to upload dataset");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function downloadDataset(datasetId: number, token?: string): Promise<{ blob: Blob; filename: string }> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/octet-stream",
      ...authHeader(token)
    };

    const res = await fetch(`/api/datasets/download/${datasetId}`, {
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to download dataset");
      throw new Error(`${res.status}: ${message}`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename\*=UTF-8''([^;\n]+)|filename="?([^";\n]+)"?/i.exec(disposition);
    const raw = match?.[1] ?? match?.[2] ?? `dataset-${datasetId}.csv`;
    const filename = decodeURIComponent(raw.replace(/^"|"$/g, ""));

    return { blob, filename };
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteDataset(datasetId: number, token?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/datasets/${datasetId}`, {
      method: "DELETE",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to delete dataset");
      throw new Error(`${res.status}: ${message}`);
    }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function getDatasetInfo(datasetId: number, token?: string): Promise<DatasetDTO> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/datasets/info/${datasetId}`, {
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to get dataset info");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
