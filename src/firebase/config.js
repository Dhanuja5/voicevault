// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB8hcGvFRFni3F1kfCzeCfJInIFlXX1TfE",
  authDomain: "voicevault-16d35.firebaseapp.com",
  projectId: "voicevault-16d35",
  storageBucket: "voicevault-16d35.firebasestorage.app",
  messagingSenderId: "440041041938",
  appId: "1:440041041938:web:f34cfcaf87f7dc7771e8cb",
  measurementId: "G-R8FXJYVKGZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

export { app, analytics };
