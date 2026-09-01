import React, { useEffect, useState } from "react";
import { useAuth0 } from "@auth0/auth0-react";
import AuthGate from "./AuthGate";
import { useManagementApi } from "./useManagementApi";

const OnMyWayApp = React.lazy(() => import("./OnMyWay"));

// ─── LOADING OVERLAY ──────────────────────────────────────────────────────────
function LoadingProfile() {
  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", background: "#0A0A0F", gap: 16,
    }}>
      <div style={{
        width: 44, height: 44,
        border: "3px solid rgba(255,255,255,0.08)",
        borderTop: "3px solid #FF6B35",
        borderRadius: "50%",
        animation: "omw-spin 0.8s linear infinite",
      }} />
      <div style={{ fontSize: 13, color: "rgba(240,237,232,0.4)", fontFamily: "'Syne',sans-serif" }}>
        Loading your profile…
      </div>
      <style>{`@keyframes omw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── AUTHENTICATED SHELL ──────────────────────────────────────────────────────
function AuthenticatedApp() {
  const { user, logout } = useAuth0();
  const { loadOmwProfile, saveOmwProfile, loading: mgmtLoading } = useManagementApi();

  const [profileLoaded, setProfileLoaded] = useState(false);
  const [savedProfile,  setSavedProfile ] = useState(null);

  // On mount: try to load any previously saved On My Way profile from user_metadata
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await loadOmwProfile();
        if (!cancelled) {
          setSavedProfile(profile);   // null = new user, object = returning user
          setProfileLoaded(true);
        }
      } catch {
        // Management API scope not yet consented — treat as new user
        if (!cancelled) setProfileLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [loadOmwProfile]);

  const handleLogout = () =>
    logout({ logoutParams: { returnTo: window.location.origin } });

  /**
   * Called when the user completes signup / verification inside the app.
   * Persists their account type, tier, and verification status to Auth0
   * user_metadata so they won't need to re-do it on next login.
   */
  const handleProfileSave = async (omwData) => {
    await saveOmwProfile({ ...omwData, verified: true, verifiedAt: new Date().toISOString() });
  };

  // Wait until we know whether this is a new or returning user
  if (!profileLoaded || mgmtLoading) return <LoadingProfile />;

  return (
    <React.Suspense fallback={<LoadingProfile />}>
      <OnMyWayApp
        // Auth0 identity
        auth0User={user}
        onLogout={handleLogout}
        startAuthenticated={true}

        // Returning-user fast-path: if savedProfile exists, skip signup flow
        // and go straight to the dashboard with the saved account type/tier
        savedProfile={savedProfile}

        // Called after verification step completes — saves to user_metadata
        onProfileSave={handleProfileSave}
      />
    </React.Suspense>
  );
}

// ─── APP ROOT ─────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <AuthGate>
      <AuthenticatedApp />
    </AuthGate>
  );
}
