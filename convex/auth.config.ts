const authConfig = {
  providers: [
    {
      // Clerk frontend API URL - the JWT issuer for the "convex" JWT template.
      domain:
        process.env.CLERK_FRONTEND_API_URL ??
        "https://sweeping-monarch-32.clerk.accounts.dev",
      applicationID: "convex",
    },
  ],
};

export default authConfig;
