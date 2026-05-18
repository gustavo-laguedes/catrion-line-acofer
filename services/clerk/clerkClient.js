import { env } from "../../shared/config/env.js";

export const clerkClient = {
  isReady() {
    return Boolean(env.clerkPublishableKey);
  },

  async getCurrentUser() {
    console.warn("Clerk ainda não configurado.");
    return null;
  },

  async signOut() {
    console.warn("Logout via Clerk ainda não configurado.");
  }
};