import React, { useState } from 'react';
import { auth } from './firebase';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import './App.css';

function App() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [user, setUser] = useState(null);
  const [message, setMessage] = useState('');

  const signUp = async () => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      setMessage('✅ Registered Successfully!');
    } catch (error) {
      setMessage(`❌ ${error.message}`);
    }
  };

  const logIn = async () => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      setUser(userCredential.user);
      setMessage('✅ Logged In Successfully!');
    } catch (error) {
      setMessage(`❌ ${error.message}`);
    }
  };

  const logOut = async () => {
    await signOut(auth);
    setUser(null);
    setMessage('👋 Logged Out');
  };

  return (
    <div className="container">
      <div className="glass-card">
        <h1>🎤 VoiceVault</h1>
        {user ? (
          <>
            <p className="welcome-text">Logged in as: <strong>{user.email}</strong></p>
            <button className="btn logout" onClick={logOut}>Log Out</button>
          </>
        ) : (
          <>
            <input
              type="email"
              placeholder="Email"
              onChange={(e) => setEmail(e.target.value)}
              className="input"
            />
            <input
              type="password"
              placeholder="Password"
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
            <div className="btn-group">
              <button className="btn signup" onClick={signUp}>Sign Up</button>
              <button className="btn login" onClick={logIn}>Log In</button>
            </div>
          </>
        )}
        {message && <p className="message">{message}</p>}
      </div>
    </div>
  );
}

export default App;
