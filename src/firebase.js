import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// TODO: Replace this with your actual Firebase project configuration
// 1. Go to Firebase Console (https://console.firebase.google.com/)
// 2. Create a new project or select an existing one
// 3. Add a Web App to get your configuration object
// 4. Enable Firestore Database in Test Mode or configure proper rules
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Check if actual configuration is provided
export const isFirebaseConfigured = 
  firebaseConfig.projectId && 
  firebaseConfig.projectId !== "YOUR_PROJECT_ID";

let db = null;

if (isFirebaseConfigured) {
  try {
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  } catch (err) {
    console.error("Firebase initialization failed:", err);
  }
}

export { db };

