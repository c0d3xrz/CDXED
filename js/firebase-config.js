// ==========================================================================
// CDXED — Firebase bootstrap (shared by main.js and admin.js)
//
// These values (apiKey, projectId, etc.) are PUBLIC identifiers, not secrets.
// Firebase web apps are designed to ship this config in client code — real
// protection comes from Firebase Authentication + Firestore Security Rules
// (see firestore.rules), not from hiding this object.
//
// NOTE: no Cloud Storage here on purpose — the site doesn't upload any
// files anymore (profile photo, certificate badge and project video/cover
// are all just pasted links), so there's no Storage bucket to initialize
// and no Blaze (pay-as-you-go) plan requirement.
// ==========================================================================

import { initializeApp }        from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import { getAnalytics, isSupported as analyticsIsSupported } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-analytics.js";
import { getFirestore }         from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { getAuth }              from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyB_ORDjSQvLLRLxVd4GX5heDqLKb3tlU64",
  authDomain: "cdxed-c2d54.firebaseapp.com",
  projectId: "cdxed-c2d54",
  storageBucket: "cdxed-c2d54.firebasestorage.app",
  messagingSenderId: "655802853991",
  appId: "1:655802853991:web:d052973cff1d2d88c2c2c2",
  measurementId: "G-ZN8X7G4V0Z"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// Analytics can fail silently in some browsers/ad-blockers — never let it
// break the site if it does.
analyticsIsSupported().then((ok) => { if (ok) { try { getAnalytics(app); } catch (_) {} } }).catch(() => {});
