
import { handleUnauthorized, handleNetworkError } from "../../core/http";

export async function getTaskStatus(trackingId: string, token?: string) {
  try {
    const res = await fetch(`/api/tasks/${trackingId}`, {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Status ${res.status}: ${text || res.statusText}`);
    }
    return res.json(); // επιστρέφει π.χ. { status: "RUNNING" }
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function stopTask(taskId: string, token: string) {
  try {
    const res = await fetch(`/api/tasks/${taskId}/stop`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
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
