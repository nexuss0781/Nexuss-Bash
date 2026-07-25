const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "https://nexuss-bash.onrender.com";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nexuss_bash_token");
}

async function request<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (
    options.body &&
    typeof options.body === "string" &&
    !headers["Content-Type"]
  ) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

export async function apiPost<T = unknown>(
  path: string,
  body?: unknown
): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function apiUpload<T = unknown>(
  path: string,
  file: File
): Promise<T> {
  const formData = new FormData();
  formData.append("file", file);

  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers,
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    const message =
      data?.error?.message || data?.message || `Upload failed: ${response.status}`;
    throw new Error(message);
  }

  return data as T;
}

export async function apiDelete<T = unknown>(path: string): Promise<T> {
  return request<T>(path, { method: "DELETE" });
}

export { BASE_URL };
