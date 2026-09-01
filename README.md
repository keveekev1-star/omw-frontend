# On My Way — SPA with Auth0

Peer-to-peer ride share, grocery delivery & more.  
React 18 · Auth0 PKCE · Leaflet maps · No backend required.

---

## ⚠️ Security — read before deploying

**Rotate your credentials immediately.**  
The Management API client secret was shared in a chat session — treat it as compromised.  
Go to: Auth0 Dashboard → Applications → [your app] → Rotate Secret.

**SPAs never use a client secret.**  
The Auth0 integration here uses the Authorization Code + PKCE flow, which is designed for public clients (browsers). There is no client secret in this codebase — that is correct and intentional.

---

## Auth0 Setup

### 1. Create a SPA application in Auth0

1. Log in to https://manage.auth0.com/
2. Applications → **Create Application**
3. Choose **Single Page Application** → Create
4. Go to **Settings** and configure:

| Setting | Value |
|---|---|
| Allowed Callback URLs | `http://localhost:3000, https://yourdomain.com` |
| Allowed Logout URLs | `http://localhost:3000, https://yourdomain.com` |
| Allowed Web Origins | `http://localhost:3000, https://yourdomain.com` |

5. Copy the **Client ID** (NOT the secret — SPAs have none)

### 2. Update the config file

Open `src/auth0-config.js` and replace `YOUR_SPA_CLIENT_ID`:

```js
export const auth0Config = {
  domain:   "on-my-way.us.auth0.com",
  clientId: "paste-your-spa-client-id-here",   // ← replace this
  ...
};
```

### 3. Optional — Social logins

In Auth0 Dashboard → Connections → Social, enable:
- Google (recommended)
- Apple (if deploying to iOS)
- Facebook, GitHub, etc.

No code changes needed — Auth0 Universal Login handles it.

---

## Local development

```bash
npm install
npm start
# Opens http://localhost:3000
```

The app will show the On My Way login screen.  
Auth0 redirects back to `http://localhost:3000` after sign-in.

---

## Production build

```bash
npm run build
```

Deploy the `build/` folder to any static host:
- **Vercel** — `vercel --prod`
- **Netlify** — drag-and-drop `build/` or `netlify deploy`
- **AWS S3 + CloudFront**
- **GitHub Pages**

For SPA routing (all paths → `index.html`):
- Vercel/Netlify: handled automatically
- S3: set error document to `index.html`
- Nginx: `try_files $uri /index.html`

---

## Auth flow

```
User visits app
    ↓
AuthGate checks isAuthenticated (Auth0 SDK)
    ↓ not authenticated
Login screen → "Sign In" button
    ↓
Auth0 Universal Login (hosted, secure)
    ↓ success
Redirect back to app with auth code
    ↓
SDK exchanges code + PKCE verifier for tokens (no secret needed)
    ↓
AuthGate renders the full OnMyWay app
    ↓
User name/email pre-filled from Auth0 profile
Account type selection → Verification → Dashboard
```

---

## File structure

```
src/
  auth0-config.js   ← Auth0 domain + SPA client ID (no secret)
  index.js          ← ReactDOM root, Auth0Provider wrapper
  App.js            ← AuthGate → AuthenticatedApp shell
  AuthGate.js       ← Login screen, loading spinner, error screen
  OnMyWay.jsx       ← Full application (landing, signup, dashboard)
public/
  index.html        ← HTML entry point
```

---

## Environment variables (optional)

If you prefer not to hardcode the client ID, use an env file:

```bash
# .env.local (never commit this)
REACT_APP_AUTH0_DOMAIN=on-my-way.us.auth0.com
REACT_APP_AUTH0_CLIENT_ID=your-spa-client-id
```

Then in `auth0-config.js`:
```js
domain:   process.env.REACT_APP_AUTH0_DOMAIN,
clientId: process.env.REACT_APP_AUTH0_CLIENT_ID,
```

---

## What Auth0 provides out of the box

- ✅ Email + password signup & login
- ✅ Social logins (Google, Apple, etc.) — enable in dashboard
- ✅ Email verification flow
- ✅ Password reset
- ✅ MFA (enable in dashboard → Security → MFA)
- ✅ Brute-force protection & anomaly detection
- ✅ GDPR-ready data controls
- ✅ Session management & silent token renewal
