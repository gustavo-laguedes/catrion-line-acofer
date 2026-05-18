const API_BASE_URL = "http://localhost:3333";

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.error || `Erro HTTP ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function apiGet(path) {
  return apiRequest(path);
}

export function apiPost(path, data) {
  return apiRequest(path, {
    method: "POST",
    body: JSON.stringify(data)
  });
}

export function apiPut(path, data) {
  return apiRequest(path, {
    method: "PUT",
    body: JSON.stringify(data)
  });
}

export function apiDelete(path) {
  return apiRequest(path, {
    method: "DELETE"
  });
}
