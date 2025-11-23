import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type ModelExecutionDTO = {
  id: number;
  modelName: string;
  modelType: "WEKA" | "CUSTOM";
  algorithmName: string;
  datasetName: string;
  executedAt: string;
  status: "IN_PROGRESS" | "FINISHED" | "FAILED" | "COMPLETED" | "PENDING" | "RUNNING";
  predictionResult: string | null;
  modelId: number;
  datasetId: number | null;
  hasResultFile: boolean;
  ownerUsername: string | null;
  accessibility?: "PUBLIC" | "PRIVATE" | "RESTRICTED";
};

export type ExecutionsResponse = {
  dataHeader: ModelExecutionDTO[];
  message: string;
};

export type ExecutionSearchParams = {
  executedAtFrom?: string;
  executedAtTo?: string;
};

export async function getExecutions(token?: string, params?: ExecutionSearchParams): Promise<ModelExecutionDTO[]> {
  try {
    const res = await fetch('/api/model-exec/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: JSON.stringify(params || {})
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function getExecutionDetails(executionId: number, token?: string): Promise<ModelExecutionDTO> {
  try {
    const res = await fetch(`/api/model-exec/${executionId}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function downloadExecutionResult(executionId: number, token?: string): Promise<Blob> {
  try {
    const res = await fetch(`/api/model-exec/${executionId}/result`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }

    return res.blob();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export type RetrainModelOptionDTO = {
  modelId: number;
  modelName: string;
  trainingId: number;
  algorithmName: string;
  datasetName: string;
  status: string;
};

export type RetrainOptionsResponse = {
  trainings: any[];
  models: RetrainModelOptionDTO[];
};

export async function getModels(token?: string): Promise<RetrainModelOptionDTO[]> {
  try {
    const res = await fetch('/api/train/retrain/options', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }

    const data: RetrainOptionsResponse = await res.json();
    return data.models || [];
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export type ExecutionStartResponse = {
  dataHeader: string;
  message: string;
};

export async function startExecution(formData: FormData, token?: string): Promise<ExecutionStartResponse> {
  try {
    const res = await fetch('/api/model-exec/execute', {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: formData
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteExecution(executionId: number, token?: string): Promise<void> {
  try {
    const res = await fetch(`/api/model-exec/delete/${executionId}`, {
      method: 'DELETE',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }

    // Consume the response body to prevent hanging
    await res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}