/**
 * On My Way — Auth0 Management API hook for Single-Page Applications
 *
 * What SPAs can do with the Management API (per Auth0 docs):
 *   ✅ GET  /api/v2/users/{id}              — read own full profile
 *   ✅ PATCH /api/v2/users/{id}             — update own user_metadata
 *   ✅ GET  /api/v2/users/{id}/enrollments  — read own MFA enrollments
 *   ❌ Password changes via PATCH — not allowed for SPA tokens (by design)
 *
 * Auth pattern:
 *   getAccessTokenSilently({ audience: "https://on-my-way.us.auth0.com/api/v2/" })
 *   This requests a token scoped to the Management API, separate from the
 *   regular app token. Auth0 limits the scopes a SPA can request to only
 *   those affecting the currently logged-in user.
 *
 * Required scopes (request on login or silently):
 *   read:current_user
 *   update:current_user_metadata
 */

import { useCallback, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";

const DOMAIN   = "on-my-way.us.auth0.com";
const MGMT_API = `https://${DOMAIN}/api/v2`;

// ─── SCOPES available to SPAs (subset of full Management API) ────────────────
export const SPA_SCOPES = [
  "read:current_user",
  "update:current_user_metadata",
  "read:current_user_metadata",
].join(" ");

// ─── HOOK ─────────────────────────────────────────────────────────────────────
export function useManagementApi() {
  const { getAccessTokenSilently, user } = useAuth0();
  const [loading, setLoading] = useState(false);
  const [error,   setError  ] = useState(null);

  /**
   * Get a Management API token scoped to the current user.
   * Audience must be the Management API URL — different from the regular app token.
   */
  const getMgmtToken = useCallback(async () => {
    return await getAccessTokenSilently({
      authorizationParams: {
        audience: `https://${DOMAIN}/api/v2/`,
        scope: SPA_SCOPES,
      },
    });
  }, [getAccessTokenSilently]);

  /**
   * Fetch the full Auth0 profile of the current user.
   * Includes user_metadata, app_metadata, identities, etc.
   */
  const getUserProfile = useCallback(async () => {
    if (!user?.sub) return null;
    setLoading(true);
    setError(null);
    try {
      const token    = await getMgmtToken();
      const response = await fetch(`${MGMT_API}/users/${encodeURIComponent(user.sub)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Management API ${response.status}: ${response.statusText}`);
      return await response.json();
    } catch (e) {
      setError(e.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [getMgmtToken, user?.sub]);

  /**
   * Update the current user's user_metadata.
   * user_metadata is for user-controlled data (display name, prefs, etc.)
   * app_metadata is admin-only and cannot be written from a SPA.
   *
   * Example:
   *   await updateUserMetadata({ accountType: "traveler", travelerTier: "pro" })
   */
  const updateUserMetadata = useCallback(async (metadata) => {
    if (!user?.sub) return false;
    setLoading(true);
    setError(null);
    try {
      const token    = await getMgmtToken();
      const response = await fetch(`${MGMT_API}/users/${encodeURIComponent(user.sub)}`, {
        method:  "PATCH",
        headers: {
          Authorization:  `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ user_metadata: metadata }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Management API ${response.status}`);
      }
      return await response.json();
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, [getMgmtToken, user?.sub]);

  /**
   * Read only user_metadata for the current user.
   */
  const getUserMetadata = useCallback(async () => {
    const profile = await getUserProfile();
    return profile?.user_metadata ?? {};
  }, [getUserProfile]);

  /**
   * Update the user's display name in Auth0 (stored in user_metadata.displayName).
   * Note: name/nickname in the root profile can only be changed by an admin M2M token.
   */
  const updateDisplayName = useCallback(async (displayName) => {
    return updateUserMetadata({ displayName });
  }, [updateUserMetadata]);

  /**
   * Save On My Way account data into user_metadata after signup/verification.
   * This persists the user's role, tier, and verification status across sessions.
   *
   * Example payload:
   * {
   *   omw_accountType:  "traveler" | "passenger",
   *   omw_travelerTier: "starter" | "pro" | "elite",
   *   omw_specialRate:  "none" | "senior" | "vet",
   *   omw_verified:     true,
   *   omw_verifiedAt:   "2025-01-01T00:00:00Z",
   * }
   */
  const saveOmwProfile = useCallback(async (omwData) => {
    const prefixed = {};
    for (const [k, v] of Object.entries(omwData)) {
      prefixed[k.startsWith("omw_") ? k : `omw_${k}`] = v;
    }
    prefixed.omw_updatedAt = new Date().toISOString();
    return updateUserMetadata(prefixed);
  }, [updateUserMetadata]);

  /**
   * Load a previously saved On My Way profile from user_metadata.
   * Returns null if the user has no saved profile.
   */
  const loadOmwProfile = useCallback(async () => {
    const meta = await getUserMetadata();
    if (!meta?.omw_accountType) return null;
    // Strip the omw_ prefix for convenience
    const profile = {};
    for (const [k, v] of Object.entries(meta)) {
      if (k.startsWith("omw_")) {
        profile[k.slice(4)] = v;   // "omw_accountType" → "accountType"
      }
    }
    return profile;
  }, [getUserMetadata]);

  return {
    // State
    loading,
    error,
    // Core
    getUserProfile,
    getUserMetadata,
    updateUserMetadata,
    // Convenience
    updateDisplayName,
    saveOmwProfile,
    loadOmwProfile,
  };
}
