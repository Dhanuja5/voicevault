import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { app } from "./config";

// Initialize Firebase Auth
const auth = getAuth(app);

// Signup
export const register = async (email, password) => {
  return createUserWithEmailAndPassword(auth, email, password);
};

// Login
export const login = async (email, password) => {
  return signInWithEmailAndPassword(auth, email, password);
};

// Logout
export const logout = async () => {
  return signOut(auth);
};
