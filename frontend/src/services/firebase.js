import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import api from './api';

let authInstance = null;

export async function getFirebaseAuth() {
  if (authInstance) return authInstance;

  try {
    const response = await api.get('/auth/firebase-config');
    const firebaseConfig = response.data;

    if (!firebaseConfig.apiKey) {
      console.warn("Firebase API key is missing from server configuration.");
      return null;
    }

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    authInstance = getAuth(app);
    return authInstance;
  } catch (error) {
    console.error('Failed to initialize Firebase Auth:', error);
    return null;
  }
}

export async function signInWithGoogle() {
  const auth = await getFirebaseAuth();
  if (!auth) {
    throw new Error('Firebase Auth is not configured on the server.');
  }
  const provider = new GoogleAuthProvider();
  // Ensure we prompt for account selection
  provider.setCustomParameters({ prompt: 'select_account' });
  const result = await signInWithPopup(auth, provider);
  return result.user;
}
