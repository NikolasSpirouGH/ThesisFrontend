import { handleUnauthorized, handleNetworkError } from "../../core/http";

export type UserDTO = {
  id: string;
  username: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  age: number | null;
  profession: string | null;
  country: string | null;
  status: string | null;
  roles: string[];
};

export type UserUpdateRequest = {
  firstName?: string;
  lastName?: string;
  email?: string;
  age?: number;
  profession?: string;
  country?: string;
};

function authHeader(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function normaliseError(res: Response, fallback: string): Promise<string> {
  handleUnauthorized(res);
  const body = await res.text().catch(() => "");
  return body || res.statusText || fallback;
}

export async function fetchAllUsers(token?: string): Promise<UserDTO[]> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/users/all", { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load users");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data || [];
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function fetchUserByUsername(username: string, token?: string): Promise<UserDTO> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/users/${username}`, { headers });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to load user");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function updateUser(request: UserUpdateRequest, token?: string): Promise<UserDTO> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch("/api/users/update", {
      method: "PUT",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to update user");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function updateUserByAdmin(
  username: string,
  request: UserUpdateRequest,
  token?: string
): Promise<UserDTO> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/users/updateByAdmin/${username}`, {
      method: "PUT",
      headers,
      body: JSON.stringify(request)
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to update user");
      throw new Error(`${res.status}: ${message}`);
    }

    const response = await res.json();
    return response.dataHeader || response.data;
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}

export async function deleteUserByAdmin(
  username: string,
  reason: string,
  token?: string
): Promise<void> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeader(token)
    };

    const res = await fetch(`/api/users/delete/${username}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ reason })
    });

    handleUnauthorized(res);

    if (!res.ok) {
      const message = await normaliseError(res, "Failed to delete user");
      throw new Error(`${res.status}: ${message}`);
    }

    // Consume the response body to prevent hanging
    await res.json();
  } catch (error) {
    handleNetworkError(error);
    throw error;
  }
}
