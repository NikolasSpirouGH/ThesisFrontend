import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type TrainingItem = {
  trainingId: number;
  algorithmName: string | null;
  modelType: string | null;
  status: string;
  startedDate: string | null;
  finishedDate: string | null;
  datasetName: string | null;
  modelId: number | null;
};

export type DownloadModelPayload = {
  blob: Blob;
  filename: string;
};

export type RetrainTrainingOption = {
  trainingId: number;
  algorithmName: string | null;
  datasetName: string | null;
  status: string | null;
  modelId: number | null;
};

export type RetrainModelOption = {
  modelId: number;
  modelName: string;
  trainingId: number | null;
  algorithmName: string | null;
  datasetName: string | null;
  status: string | null;
};

export type RetrainOptions = {
  trainings: RetrainTrainingOption[];
  models: RetrainModelOption[];
};

export type RetrainTrainingDetails = {
  trainingId: number;
  modelId: number | null;
  algorithmId: number | null;
  algorithmConfigurationId: number | null;
  customAlgorithmConfigurationId: number | null;
  algorithmName: string | null;
  algorithmOptions: string | null;
  datasetId: number | null;
  datasetConfigurationId: number | null;
  datasetName: string | null;
  basicAttributesColumns: string | null;
  targetColumn: string | null;
  status: string | null;
};

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function normaliseError(res: Response, fallback: string): Promise<string> {
  handleUnauthorized(res);
  const body = await res.text().catch(() => "");
  return body || res.statusText || fallback;
}

export async function fetchTrainings(token?: string): Promise<TrainingItem[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/train/trainings", { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load trainings");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function startTraining(formData: FormData, token?: string) {
  try {
    const res = await fetch("/api/train/train-model", {
      method: "POST",
      headers: {
        ...authHeader(token)
      },
      body: formData
    });

    handleUnauthorized(res);

    if (!res.ok) {
      throw new Error(`Failed (${res.status})`);
    }
    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteTraining(trainingId: number, token?: string): Promise<void> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/train/delete/${trainingId}`, {
      method: "DELETE",
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to delete training");
      throw new Error(`${res.status}: ${message}`);
    }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function downloadTrainingModel(trainingId: number, token?: string): Promise<DownloadModelPayload> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/octet-stream",
      ...authHeader(token)
    };

    const res = await fetch(`/api/models/training/${trainingId}/download-model`, {
      headers
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to download model");
      throw new Error(`${res.status}: ${message}`);
    }

    const blob = await res.blob();
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = /filename\*=UTF-8''([^;\n]+)|filename="?([^";\n]+)"?/i.exec(disposition);
    const raw = match?.[1] ?? match?.[2] ?? `model-${trainingId}.bin`;
    const filename = decodeURIComponent(raw.replace(/^"|"$/g, ""));

    return { blob, filename };
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function fetchRetrainOptions(token?: string): Promise<RetrainOptions> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/train/retrain/options", { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load retrain options");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function fetchRetrainTrainingDetails(trainingId: number, token?: string): Promise<RetrainTrainingDetails> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/train/retrain/trainings/${trainingId}`, { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load training details");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function fetchRetrainModelDetails(modelId: number, token?: string): Promise<RetrainTrainingDetails> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/train/retrain/models/${modelId}`, { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load model details");
      throw new Error(`${res.status}: ${message}`);
    }

    return res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export type CustomTrainingRequest = {
  algorithmId: number;
  datasetFile: File;
  parametersFile?: File;
  basicAttributesColumns?: string;
  targetColumn?: string;
};

export async function startCustomTraining(request: CustomTrainingRequest, token?: string): Promise<{ taskId: string }> {
  try {
    const formData = new FormData();
    formData.append("algorithmId", request.algorithmId.toString());
    formData.append("datasetFile", request.datasetFile);

    if (request.parametersFile) {
      formData.append("parametersFile", request.parametersFile);
    }

    if (request.basicAttributesColumns) {
      formData.append("basicAttributesColumns", request.basicAttributesColumns);
    }

    if (request.targetColumn) {
      formData.append("targetColumn", request.targetColumn);
    }

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch("/api/train/custom", {
      method: "POST",
      headers,
      body: formData
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to start custom training");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return { taskId: response.dataHeader || response.data };
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
