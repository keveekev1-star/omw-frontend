/**
 * On My Way — Auth0 Configuration
 *
 * SECURITY NOTES:
 * ─────────────────────────────────────────────────────────────────────
 * • SPAs use the Authorization Code + PKCE flow — NO client secret.
 * • Never put a client secret in frontend code. Any secret in browser
 *   source can be stolen by anyone who opens DevTools.
 * • The Management API credentials you were given are server-side only.
 *   Rotate them immediately at: Auth0 Dashboard → Applications → rotate.
 * ─────────────────────────────────────────────────────────────────────
 *
 * HOW TO GET YOUR SPA CLIENT ID:
 * 1. Go to https://manage.auth0.com/
 * 2. Applications → Create Application → Single Page Application
 * 3. Copy the "Client ID" shown (NOT the secret — SPAs have no secret)
 * 4. In Settings, set:
 *    - Allowed Callback URLs:    http://localhost:3000, https://yourdomain.com
 *    - Allowed Logout URLs:      http://localhost:3000, https://yourdomain.com
 *    - Allowed Web Origins:      http://localhost:3000, https://yourdomain.com
 * 5. Paste the Client ID below.
 */

export const auth0Config = {
  domain: process.env.REACT_APP_AUTH0_DOMAIN || "on-my-way.us.auth0.com",

  // Replace with your SPA Application's Client ID from Auth0 Dashboard
  // (Applications → your SPA app → Client ID)
  clientId: process.env.REACT_APP_AUTH0_CLIENT_ID || "YOUR_SPA_CLIENT_ID",

  authorizationParams: {
    redirect_uri: window.location.origin,
    // Request offline_access if you need refresh tokens (requires
    // "Allow Offline Access" enabled in Auth0 app settings)
    // scope: "openid profile email offline_access",
    // Request management API scopes at login so silent token exchange works later
    scope: "openid profile email read:current_user update:current_user_metadata",
  },

  // Cache tokens in memory (most secure for SPAs).
  // Switch to "localstorage" only if you need sessions to survive refresh.
  cacheLocation: "memory",

  // Enable refresh tokens via silent auth (requires no-prompt support)
  useRefreshTokens: true,
};
