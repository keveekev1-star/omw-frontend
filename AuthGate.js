import React from "react";
import { useAuth0 } from "@auth0/auth0-react";

// ─── BRAND COLOURS ────────────────────────────────────────────────────────────
const C = {
  bg:      "#0A0A0F",
  surface: "#111118",
  border:  "rgba(255,255,255,0.08)",
  text:    "#F0EDE8",
  muted:   "rgba(240,237,232,0.45)",
  orange:  "#FF6B35",
  green:   "#4CAF82",
};

// ─── SPINNER ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: C.bg }}>
      <div style={{
        width: 44, height: 44,
        border: `3px solid ${C.border}`,
        borderTop: `3px solid ${C.orange}`,
        borderRadius: "50%",
        animation: "omw-spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes omw-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen() {
  const { loginWithRedirect } = useAuth0();

  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      {/* Ambient glow */}
      <div style={{
        position: "fixed", top: "-20%", left: "50%", transform: "translateX(-50%)",
        width: 600, height: 400,
        background: "radial-gradient(ellipse, rgba(255,107,53,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Card */}
      <div style={{
        background: C.surface,
        border: `1.5px solid ${C.border}`,
        borderRadius: 28,
        padding: "44px 40px",
        width: "100%", maxWidth: 420,
        textAlign: "center",
        boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
        position: "relative",
      }}>
        {/* Logo mark */}
        <div style={{
          width: 72, height: 72,
          background: `linear-gradient(135deg, ${C.orange}, #FF9A5C)`,
          borderRadius: 20,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 32,
          boxShadow: `0 8px 32px ${C.orange}44`,
        }}>
          🗺️
        </div>

        <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-1px", marginBottom: 6 }}>
          On My Way
        </div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 32 }}>
          Peer-to-peer rides, grocery delivery &amp; more.<br />
          Sign in to get started.
        </div>

        {/* Primary CTA */}
        <button
          onClick={() => loginWithRedirect()}
          style={{
            width: "100%", padding: "16px",
            background: C.orange, border: "none", borderRadius: 14,
            color: "#0A0A0F", fontSize: 15, fontWeight: 800,
            cursor: "pointer", fontFamily: "'Syne', sans-serif",
            marginBottom: 12, transition: "opacity 0.15s",
          }}
          onMouseEnter={e => e.target.style.opacity = "0.9"}
          onMouseLeave={e => e.target.style.opacity = "1"}
        >
          Sign In / Create Account →
        </button>

        {/* Sign up shortcut */}
        <button
          onClick={() => loginWithRedirect({ authorizationParams: { screen_hint: "signup" } })}
          style={{
            width: "100%", padding: "14px",
            background: "transparent",
            border: `1.5px solid ${C.border}`,
            borderRadius: 14,
            color: C.muted, fontSize: 14, fontWeight: 700,
            cursor: "pointer", fontFamily: "'Syne', sans-serif",
            transition: "border-color 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.target.style.borderColor = "rgba(255,255,255,0.2)"; e.target.style.color = C.text; }}
          onMouseLeave={e => { e.target.style.borderColor = C.border; e.target.style.color = C.muted; }}
        >
          New here? Create an account
        </button>

        {/* Privacy note */}
        <p style={{ marginTop: 24, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
          Your identity is verified and encrypted.<br />
          Never shared publicly — see our{" "}
          <span style={{ color: C.green, cursor: "pointer", textDecoration: "underline" }}>
            Privacy Policy
          </span>
          .
        </p>
      </div>

      {/* Footer */}
      <p style={{ marginTop: 24, fontSize: 11, color: C.muted }}>
        © {new Date().getFullYear()} On My Way · All rights reserved
      </p>
    </div>
  );
}

// ─── ERROR SCREEN ─────────────────────────────────────────────────────────────
function ErrorScreen({ error }) {
  const { logout } = useAuth0();
  return (
    <div style={{
      minHeight: "100vh", background: C.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        background: C.surface, border: `1.5px solid rgba(255,107,53,0.3)`,
        borderRadius: 20, padding: "32px", maxWidth: 380, textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Authentication error</div>
        <div style={{ fontSize: 13, color: C.muted, marginBottom: 24, lineHeight: 1.6 }}>
          {error?.message || "Something went wrong during sign-in."}
        </div>
        <button
          onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
          style={{
            padding: "12px 24px", background: C.orange, border: "none",
            borderRadius: 12, color: "#0A0A0F", fontWeight: 800, fontSize: 14,
            cursor: "pointer", fontFamily: "'Syne', sans-serif",
          }}
        >
          Back to Sign In
        </button>
      </div>
    </div>
  );
}

// ─── AUTH GATE (main export) ──────────────────────────────────────────────────
/**
 * Wraps any children behind Auth0 authentication.
 *
 * States:
 *   loading       → full-screen spinner
 *   error         → error screen with retry
 *   not logged in → On My Way branded login screen
 *   logged in     → renders children (the full app)
 */
export default function AuthGate({ children }) {
  const { isLoading, isAuthenticated, error } = useAuth0();

  if (isLoading)       return <Spinner />;
  if (error)           return <ErrorScreen error={error} />;
  if (!isAuthenticated) return <LoginScreen />;

  return children;
}
