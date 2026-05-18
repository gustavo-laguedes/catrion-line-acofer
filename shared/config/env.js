export const env = {
  clerkPublishableKey: "",
  neonApiBaseUrl: "",
  r2PublicBaseUrl: "",

  isConfigured() {
    return Boolean(
      this.clerkPublishableKey &&
      this.neonApiBaseUrl &&
      this.r2PublicBaseUrl
    );
  }
};