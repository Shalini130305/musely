# MUSELY — Production Deployment & Mobile App Guide

## 1. Current Architecture

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Backend | Express + TypeScript + Prisma ORM |
| Database | SQLite (dev) → PostgreSQL (production recommended) |
| Auth | JWT + bcrypt (email/password) |
| Media | Cloudinary (production) / base64 fallback (dev) |
| Hosting | Any Node.js host (Railway, Render, DigitalOcean, Vercel) |

---

## 2. Run Locally

```bash
# Terminal 1 — Backend API
cd server
npm install
npx prisma db push
npm run dev        # → http://localhost:4000

# Terminal 2 — Frontend
cd client
npm install
npm run dev        # → http://localhost:5173
```

---

## 3. Website Production Deployment

### Recommended Stack: Railway.app (easiest for Express + SQLite/Postgres)

#### Step 1 — Upgrade to PostgreSQL (Strongly Recommended)

1. Create a PostgreSQL database on Railway, Supabase, or Neon
2. Update `server/.env`:
   ```
   DATABASE_URL="postgresql://user:pass@host:5432/musely_prod"
   ```
3. Update `server/prisma/schema.prisma` datasource:
   ```
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
4. Run migrations: `npx prisma migrate deploy`

#### Step 2 — Configure Cloudinary (Required for Image Uploads)

1. Create free account at https://cloudinary.com
2. Set env vars:
   ```
   CLOUDINARY_CLOUD_NAME=your-cloud
   CLOUDINARY_API_KEY=your-key
   CLOUDINARY_API_SECRET=your-secret
   ```

#### Step 3 — Configure Email (Required for Password Reset)

Gmail App Password (easiest):
1. Enable 2FA on your Gmail account
2. Generate an App Password at https://myaccount.google.com/apppasswords
3. Set env vars:
   ```
   EMAIL_FROM=noreply@yourdomain.com
   EMAIL_FROM_NAME=MUSELY
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your@gmail.com
   SMTP_PASS=your-app-password
   ```

#### Step 4 — Deploy to Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and create project
railway login
railway init

# Set environment variables
railway variables set DATABASE_URL="..." JWT_SECRET="..." # etc.

# Deploy
railway up
```

#### Step 5 — Deploy Frontend to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

cd client

# Update API base URL for production
# In client/src/services/api.ts, set baseURL to your Railway URL

vercel --prod
```

#### Step 6 — Custom Domain

1. Buy domain (e.g., musely.in on GoDaddy/Namecheap)
2. In Vercel: Add custom domain → set DNS A/CNAME records
3. In Railway: Add custom domain for API → e.g., api.musely.in
4. Update server `.env`: `CLIENT_URL=https://musely.in`
5. Update CORS in `server/src/index.ts` to allow production domain

---

## 4. Google OAuth Setup (Future)

1. Go to https://console.cloud.google.com
2. Create a new project → Enable "Google+ API" and "Google Identity"
3. Create OAuth 2.0 credentials (Web Application)
4. Add authorized redirect URIs:
   - `http://localhost:4000/api/auth/google/callback` (dev)
   - `https://api.musely.in/api/auth/google/callback` (production)
5. Set in `.env`:
   ```
   GOOGLE_CLIENT_ID=your-client-id
   GOOGLE_CLIENT_SECRET=your-client-secret
   ```
6. Install passport: `npm install passport passport-google-oauth20`
7. Implement OAuth routes in `server/src/routes/auth.ts`

**Note**: Google login is NOT currently implemented in the backend. The infrastructure (schema, env vars) is prepared. Contact the developer to implement OAuth routes.

---

## 5. Phone OTP Setup (Future — India)

**Recommended provider: MSG91 (most reliable for Indian numbers)**

1. Create account at https://msg91.com
2. Get DLT registration (mandatory for Indian SMS as of 2021)
3. Create a DLT-approved template for OTP
4. Set in `.env`:
   ```
   MSG91_AUTH_KEY=your-auth-key
   MSG91_SENDER_ID=MUSELY
   MSG91_ROUTE=4
   ```
5. Install client: `npm install axios`
6. Implement OTP send/verify in `server/src/routes/auth.ts`

**DLT Registration**: Required by TRAI for transactional SMS in India.
Register at: https://www.airtel.in/business/dlt or Vodafone/Jio DLT portal.

---

## 6. Android App (Capacitor.js)

Capacitor wraps your existing React web app as a native Android APK — no separate codebase needed.

### Setup

```bash
cd client

# Install Capacitor
npm install @capacitor/core @capacitor/android @capacitor/cli

# Initialize
npx cap init MUSELY in.musely.app --web-dir dist

# Build web app
npm run build

# Add Android platform
npx cap add android

# Sync
npx cap sync android

# Open in Android Studio
npx cap open android
```

### Configuration (capacitor.config.ts)
```typescript
import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'in.musely.app',
  appName: 'MUSELY',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // For production, point to your deployed API:
    // url: 'https://musely.in'
  },
  plugins: {
    Camera: { permissions: ['camera', 'photos'] },
  },
};

export default config;
```

### App Icon & Splash Screen
```bash
npm install @capacitor/assets
# Place icon.png (1024x1024) and splash.png (2732x2732) in resources/
npx capacitor-assets generate
```

### Release Build

1. In Android Studio → Build → Generate Signed Bundle/APK
2. Create a new keystore (keep it SAFE — never commit to git)
3. Build Release APK or AAB (App Bundle — required for Play Store)

### Google Play Store Checklist

- [ ] Unique Application ID: `in.musely.app`
- [ ] Target API Level: 35 (Android 15) — required from Aug 2025
- [ ] Privacy Policy URL (required for social apps)
- [ ] Data Safety disclosure (declare: account, messages, photos collected)
- [ ] Account deletion: must be in-app AND accessible via web
- [ ] Content rating: complete questionnaire (Social Networking category)
- [ ] Store listing: screenshots (phone + tablet), feature graphic
- [ ] App icon: 512x512 PNG

### Required Permissions (AndroidManifest.xml)
```xml
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE"
    android:maxSdkVersion="32" />
```

---

## 7. iOS App (Capacitor.js)

### Prerequisites
- Mac with macOS 13+ (Ventura or later)
- Xcode 15+ (free from Mac App Store)
- Apple Developer Account ($99/year) — required for App Store distribution

### Setup

```bash
cd client

# Install iOS platform (requires Mac)
npx cap add ios

# Sync
npx cap sync ios

# Open in Xcode
npx cap open ios
```

### Configuration
- Bundle ID: `in.musely.app`
- Display name: MUSELY
- Version: 1.0.0

### Info.plist Permissions
```xml
<key>NSCameraUsageDescription</key>
<string>MUSELY needs camera access to let you take profile photos and post images.</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>MUSELY needs photo library access to let you upload images to posts and your profile.</string>
```

### App Store Checklist

- [ ] Bundle Identifier: `in.musely.app`
- [ ] Signing: Automatic signing in Xcode with Apple Developer account
- [ ] Privacy manifest (PrivacyInfo.xcprivacy) — required since May 2024
- [ ] Privacy Policy URL in App Store Connect
- [ ] App icons: all required sizes (1024x1024 for App Store)
- [ ] Screenshots: 6.7" (iPhone 16 Pro Max) required, 12.9" iPad optional
- [ ] Account deletion: accessible within the app (required since June 2023)
- [ ] TestFlight testing: distribute internally before App Store review
- [ ] Content rights: confirm original content claim

### TestFlight (Beta Testing)
1. In Xcode: Product → Archive → Distribute → App Store Connect
2. In App Store Connect → TestFlight → Add testers (email)
3. Testers install via TestFlight app

---

## 8. Shared Account System

All platforms (Web, Android, iOS) use the **same backend API** and **same database**. Users sign in once and their account works everywhere.

- Token stored: `localStorage` (web) / `@capacitor/preferences` (mobile)
- Same JWT used across all clients
- Profile, posts, messages all synced in real-time

---

## 9. Security Checklist (Before Going Live)

- [ ] Change `JWT_SECRET` to a random 64+ character string
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS on all endpoints
- [ ] Set `secure: true` on cookies
- [ ] Configure proper CORS origins (not wildcard)
- [ ] Enable rate limiting (already in place)
- [ ] Set up database backups (daily minimum)
- [ ] Configure Cloudinary signed uploads
- [ ] Remove test/demo accounts from production DB
- [ ] Set up error monitoring (Sentry recommended)
- [ ] Review Prisma connection pool settings for production

---

## 10. Required Credentials Summary

| Feature | Provider | Status |
|---------|----------|--------|
| Database | SQLite (dev) / PostgreSQL (prod) | ✅ SQLite working |
| Image upload | Cloudinary | ⚠️ Needs credentials |
| Password reset email | SMTP (Gmail/SendGrid) | ⚠️ Needs credentials |
| Google Sign-In | Google Cloud Console | 🔲 Not yet implemented |
| Phone OTP | MSG91 / Fast2SMS | 🔲 Not yet implemented |
| Android release | Google Play Console ($25 one-time) | 🔲 Needs account |
| iOS release | Apple Developer ($99/year) | 🔲 Needs account |
| Custom domain | Any registrar (musely.in) | 🔲 Optional |
