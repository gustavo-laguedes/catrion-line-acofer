import { env } from "../../shared/config/env.js";

export const r2Client = {
  isReady() {
    return Boolean(env.r2PublicBaseUrl);
  },

  getPublicUrl(path) {
    if (!this.isReady()) {
      console.warn("Cloudflare R2 ainda não configurado.");
      return "";
    }

    return `${env.r2PublicBaseUrl}/${path}`;
  }
};