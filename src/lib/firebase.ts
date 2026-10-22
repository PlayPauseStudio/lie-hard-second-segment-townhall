import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Public web config of this app's own Firebase project (lie-hard-townhall).
// These values ship in the client bundle anyway, so they're inlined and Vercel
// needs no environment variables. NEXT_PUBLIC_FIREBASE_* overrides if set.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyB8FGHAAGevINdKW00iMFwmVE6cMm-4WXU',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'lie-hard-townhall.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lie-hard-townhall',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'lie-hard-townhall.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '516726236282',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:516726236282:web:8a83c622e040e8db7047c3',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getFirestore(app);

// Keeps the audience from wandering into /operator. Frontend-only, so this is a
// speed bump, not real security.
export const OPERATOR_PASSCODE = process.env.NEXT_PUBLIC_OPERATOR_PASSCODE || 'liehard2';
