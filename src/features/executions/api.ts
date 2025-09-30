import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type ModelExecutionDTO = {
  id: number;
  modelName: string;
  modelType: "WEKA" | "CUSTOM";
  algorithmName: string;
  datasetName: string;
  executedAt: string;
  status: "IN_PROGRESS" | "FINISHED" | "FAILED";
  predictionResult: string | null;
  modelId: number;
  datasetId: number | null;
  hasResultFile: boolean;
};

export type ExecutionsResponse = {
  dataHeader: ModelExecutionDTO[];
  message: string;
};

export async function getExecutions(token?: string): Promise<ExecutionsResponse> {
  try {
    const res = await fetch('/api/model-exec/list', {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
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
    const res = await fetch(`/api/model-exec/${executionId}`, {
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
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}