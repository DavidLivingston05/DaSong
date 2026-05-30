import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAnalytics, isSupported } from 'firebase/analytics';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
}

let app: FirebaseApp | null = null;
let firestore: Firestore | null = null;

// Expose a helper to parse potential Firebase Config from a standard text block
export function parseConfigString(configStr: string): FirebaseConfig | null {
  try {
    const cleanStr = configStr.trim();
    if (cleanStr.startsWith('{')) {
      const parsed = JSON.parse(cleanStr);
      if (parsed.apiKey && parsed.projectId) {
        return {
          apiKey: parsed.apiKey,
          authDomain: parsed.authDomain || '',
          projectId: parsed.projectId,
          storageBucket: parsed.storageBucket || '',
          messagingSenderId: parsed.messagingSenderId || '',
          appId: parsed.appId || '',
          measurementId: parsed.measurementId || ''
        };
      }
    }
  } catch (err) {
    console.error('Failed to parse Firebase config JSON:', err);
  }
  return null;
}

export function getFirebaseConfig(): FirebaseConfig | null {
  // 1. Check Vite environment variables (perfect for hosting like Vercel)
  if (
    import.meta.env.VITE_FIREBASE_API_KEY &&
    import.meta.env.VITE_FIREBASE_PROJECT_ID
  ) {
    return {
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
      measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
    };
  }

  // 2. Check client-side localStorage overrides
  const saved = localStorage.getItem('dasong_firebase_config');
  if (saved) {
    try {
      return JSON.parse(saved) as FirebaseConfig;
    } catch {
      return null;
    }
  }

  // 3. Out-of-the-box Default configuration (your exact project details)
  return {
    apiKey: 'AIzaSyBTUhjH0EiqmBgnWEbcTx28EIVCFlWNd9M',
    authDomain: 'dasong-9c51f.firebaseapp.com',
    projectId: 'dasong-9c51f',
    storageBucket: 'dasong-9c51f.firebasestorage.app',
    messagingSenderId: '977130728700',
    appId: '1:977130728700:web:ccc99e871605d08fdafb79',
    measurementId: 'G-MGZZHYWL9N'
  };
}

export function initFirebase(config?: FirebaseConfig): Firestore | null {
  const targetConfig = config || getFirebaseConfig();
  if (!targetConfig) return null;

  try {
    // Prevent re-initialization if app already exists
    if (getApps().length === 0) {
      app = initializeApp(targetConfig);
      
      // Initialize Analytics safely inside browser environments
      if (typeof window !== 'undefined' && targetConfig.measurementId) {
        isSupported().then((supported) => {
          if (supported) {
            getAnalytics(app!);
            console.log('Firebase Analytics initialized successfully.');
          }
        });
      }
    } else {
      app = getApp();
    }
    
    firestore = getFirestore(app);
    
    // Save to localStorage if custom config was passed manually
    if (config) {
      localStorage.setItem('dasong_firebase_config', JSON.stringify(config));
    }
    
    return firestore;
  } catch (error) {
    console.error('Failed to initialize Firebase SDK:', error);
    return null;
  }
}

export function disconnectFirebase() {
  localStorage.removeItem('dasong_firebase_config');
  app = null;
  firestore = null;
}

export function getFirestoreDB(): Firestore | null {
  if (!firestore) {
    return initFirebase();
  }
  return firestore;
}

export function isFirebaseActive(): boolean {
  return getFirestoreDB() !== null;
}
