// app.js (frontend)

// ========== Firebase Setup ==========
const firebaseConfig = {
  apiKey: "AIzaSyB8hcGvFRFni3F1kfCzeCfJInIFlXX1TfE",
  authDomain: "voicevault-16d35.firebaseapp.com",
  projectId: "voicevault-16d35",
  storageBucket: "voicevault-16d35.firebasestorage.app",
  messagingSenderId: "440041041938",
  appId: "1:440041041938:web:f34cfcaf87f7dc7771e8cb",
  measurementId: "G-R8FXJYVKGZ"
};
firebase.initializeApp(firebaseConfig);
const firestoreDb = firebase.firestore();
const firebaseAuth = firebase.auth();

// ========== Auth State ==========
let auth0Client;
let user = null;
let authMethod = null; // 'auth0' or 'firebase'
const API_BASE = window.location.origin;

// ========== Initialize on Load ==========
window.onload = async () => {
  // Initialize Auth0
  auth0Client = await createAuth0Client({
    domain: "dev-5dszzfki0zgyd02x.us.auth0.com",
    client_id: "fUIPx1IYRTFGQ5dMnhFqRinTrNM885Wc",
    cacheLocation: "localstorage",
  });

  // Handle Auth0 redirect callback
  if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, "/");
  }

  document.getElementById("loginBtn").disabled = false;

  // Check Auth0 authentication
  const isAuth0Authenticated = await auth0Client.isAuthenticated();
  if (isAuth0Authenticated) {
    authMethod = 'auth0';
    user = await auth0Client.getUser();
    document.getElementById("profile").innerText = user.email || user.name || "";
    updateUI(true);
    loadRecent();
  }

  // Firebase Auth state listener
  firebaseAuth.onAuthStateChanged((firebaseUser) => {
    if (firebaseUser && authMethod !== 'auth0') {
      authMethod = 'firebase';
      user = { email: firebaseUser.email, name: firebaseUser.displayName };
      document.getElementById("profile").innerText = firebaseUser.email || firebaseUser.displayName || "";
      updateUI(true);
      loadRecent();
    } else if (!firebaseUser && authMethod === 'firebase') {
      authMethod = null;
      user = null;
      updateUI(false);
    }
  });
};

// ========== Auth0 Login ==========
async function login() {
  await auth0Client.loginWithRedirect({ redirect_uri: window.location.origin });
}

// ========== Firebase Google Login ==========
async function loginWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebaseAuth.signInWithPopup(provider);
    // onAuthStateChanged callback will handle the rest
  } catch (err) {
    console.error("Google sign-in error:", err);
    alert("Google sign-in failed: " + err.message);
  }
}

// ========== Logout (handles both methods) ==========
async function logout() {
  if (authMethod === 'firebase') {
    await firebaseAuth.signOut();
    authMethod = null;
    user = null;
    updateUI(false);
  } else if (authMethod === 'auth0') {
    auth0Client.logout({ returnTo: window.location.origin });
    // Auth0 logout redirects, so no need to update UI here
  }
}

// ========== Update UI ==========
function updateUI(isAuthenticated) {
  document.getElementById("loginBtn").style.display = isAuthenticated ? "none" : "inline-block";
  document.getElementById("googleLoginBtn").style.display = isAuthenticated ? "none" : "inline-block";
  document.getElementById("authDivider").style.display = isAuthenticated ? "none" : "block";
  document.getElementById("logoutBtn").style.display = isAuthenticated ? "inline-block" : "none";
  document.getElementById("note-section").style.display = isAuthenticated ? "block" : "none";
}

// ========== Upload & Transcribe ==========
async function uploadAudio() {
  const fileInput = document.getElementById("audioFile");
  const file = fileInput.files[0];

  if (!file) return alert("Please select an audio file.");

  const statusEl = document.getElementById("uploadStatus");
  statusEl.style.display = "block";
  statusEl.innerHTML = '<p class="status-text">⏳ Uploading & transcribing with Whisper AI...</p>';

  const form = new FormData();
  form.append("audio", file); // must match server-side 'audio' field
  form.append("user_email", user?.email || "unknown"); // per-user isolation

  try {
    const res = await fetch(`${API_BASE}/upload-audio`, {
      method: "POST",
      body: form
    });

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(txt || "Upload failed");
    }

    const data = await res.json();

    // Save to Firestore (both subcollection & per-user top-level collection)
    statusEl.innerHTML = '<p class="status-text">🔥 Saving to Firestore...</p>';
    try {
      const userEmail = user?.email || "unknown";
      
      // Ensure the parent document exists
      await firestoreDb.collection("users").doc(userEmail).set({
        email: userEmail,
        lastActive: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      // 1. Save into user's subcollection
      await firestoreDb.collection("users").doc(userEmail).collection("transcriptions").add({
        filename: data.filename,
        transcription: data.transcription,
        mongo_id: data.id,
        user_email: userEmail,
        uploaded_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 2. ALSO save into top-level collection for direct visibility (matching MongoDB Atlas format)
      const safeCollectionName = "transcriptions_" + userEmail.toLowerCase().replace(/[^a-z0-9]/g, "_");
      await firestoreDb.collection(safeCollectionName).add({
        filename: data.filename,
        transcription: data.transcription,
        mongo_id: data.id,
        user_email: userEmail,
        uploaded_at: firebase.firestore.FieldValue.serverTimestamp()
      });

      console.log("[INFO] Saved to Firestore (user: " + userEmail + ")");
    } catch (fsErr) {
      console.warn("[WARN] Firestore save failed:", fsErr);
    }

    // Success status
    statusEl.innerHTML = '<p class="status-text" style="border-color: rgba(52,211,153,0.5); background: rgba(52,211,153,0.1);">✅ Saved to MongoDB + Firestore</p>';
    setTimeout(() => { statusEl.style.display = "none"; }, 4000);

    const container = document.getElementById("transcriptionResults");
    container.innerHTML = `
      <p><b>File:</b> ${data.filename}</p>
      <p><b>Transcription:</b><br>${escapeHtml(data.transcription)}</p>
    `;
    fileInput.value = "";
    // Refresh list
    await loadRecent();
  } catch (err) {
    console.error("Upload Audio Error:", err);
    statusEl.innerHTML = '<p class="status-text" style="border-color: rgba(255,107,107,0.5); background: rgba(255,107,107,0.1);">❌ Upload failed</p>';
    setTimeout(() => { statusEl.style.display = "none"; }, 4000);
    alert("Upload failed: " + (err.message || err));
  }
}

// ========== Load Recent (from MongoDB, filtered by user) ==========
async function loadRecent() {
  try {
    const email = user?.email || "";
    const res = await fetch(`${API_BASE}/notes?user_email=${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error("Failed to fetch notes");
    const notes = await res.json();
    renderNotes(notes);
  } catch (e) {
    console.error(e);
  }
}

// ========== Render Notes ==========
function renderNotes(notes) {
  const out = document.getElementById("transcriptionList");
  out.innerHTML = "";
  if (!notes || notes.length === 0) { out.innerHTML = "<p>No transcriptions yet.</p>"; return; }
  notes.forEach(n => {
    const div = document.createElement("div");
    div.className = "transcription-card";
    div.innerHTML = `
      <p><b>${escapeHtml(n.filename)}</b> — ${n.uploaded_at ? n.uploaded_at.split("T")[0] : ""}</p>
      <p>${escapeHtml(n.transcription || "")}</p>
      <p>
        <button onclick="deleteAudio('${n._id}')">Delete</button>
      </p>
      <hr/>
    `;
    out.appendChild(div);
  });
}

// ========== Search ==========
async function searchAudio() {
  const q = document.getElementById("audioSearchInput").value.trim();
  if (!q) return loadRecent();
  try {
    const email = user?.email || "";
    const res = await fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&user_email=${encodeURIComponent(email)}`);
    if (!res.ok) throw new Error("Search failed");
    const results = await res.json();
    renderNotes(results);
  } catch (e) {
    console.error(e);
    alert("Search failed");
  }
}

// ========== Delete (from user's MongoDB collection + Firestore) ==========
async function deleteAudio(id) {
  if (!confirm("Delete this transcription?")) return;
  try {
    const email = user?.email || "";
    // Delete from user's MongoDB collection
    const res = await fetch(`${API_BASE}/delete/${id}?user_email=${encodeURIComponent(email)}`, { method: "DELETE" });
    if (!res.ok) throw new Error("Delete failed");

    // Also delete from user's Firestore subcollection & top-level collection
    try {
      const snapshot1 = await firestoreDb.collection("users").doc(email).collection("transcriptions")
        .where("mongo_id", "==", id).get();
      const safeCollectionName = "transcriptions_" + email.toLowerCase().replace(/[^a-z0-9]/g, "_");
      const snapshot2 = await firestoreDb.collection(safeCollectionName)
        .where("mongo_id", "==", id).get();

      const deletePromises = [];
      snapshot1.forEach(doc => deletePromises.push(doc.ref.delete()));
      snapshot2.forEach(doc => deletePromises.push(doc.ref.delete()));
      await Promise.all(deletePromises);
      console.log("[INFO] Deleted from Firestore");
    } catch (fsErr) {
      console.warn("[WARN] Firestore delete failed:", fsErr);
    }

    alert("Deleted from MongoDB & Firestore");
    await loadRecent();
  } catch (e) {
    console.error(e);
    alert("Delete failed");
  }
}

// Utility: escape HTML
function escapeHtml(s) {
  if (!s) return "";
  return s.replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

// Note: loadRecent() is called after auth is confirmed (in onload and onAuthStateChanged)
// No premature loading needed - each auth callback triggers loadRecent() for the logged-in user
