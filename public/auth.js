let auth0Client;

async function initAuth0() {
  auth0Client = await createAuth0Client({
    domain: "dev-5dszzfki0zgyd02x.us.auth0.com",        // from Auth0
    client_id: "fUIPx1IYRTFGQ5dMnhFqRinTrNM885Wc",  // from Auth0
    redirect_uri: window.location.origin
  });

  // Handle redirect callback
  if (window.location.search.includes("code=") &&
      window.location.search.includes("state=")) {
    await auth0Client.handleRedirectCallback();
    window.history.replaceState({}, document.title, "/");
  }

  updateUI();
}

// Login
async function login() {
  await auth0Client.loginWithRedirect();
}

// Logout
function logout() {
  auth0Client.logout({
    returnTo: window.location.origin
  });
}

// Update UI based on auth status
async function updateUI() {
  const isAuthenticated = await auth0Client.isAuthenticated();
  if (isAuthenticated) {
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("note-section").style.display = "block";

    const user = await auth0Client.getUser();
    document.querySelector("h1").innerText = "🎤 VoiceVault - " + user.email;
  } else {
    document.getElementById("auth-section").style.display = "block";
    document.getElementById("note-section").style.display = "none";
  }
}

window.onload = initAuth0;
