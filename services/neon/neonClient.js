import { env } from "../../shared/config/env.js";

export const neonClient = {
  isReady() {
    return Boolean(env.neonApiBaseUrl);
  },

  async query(endpoint, options = {}) {
    if (!this.isReady()) {
      console.warn("Neon API ainda não configurada.");
      return null;
    }

    const response = await fetch(`${env.neonApiBaseUrl}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      ...options
    });

    if (!response.ok) {
      throw new Error("Erro ao consultar API Neon.");
    }

    return response.json();
  }
};