import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "", // pretty much safe to expose
  authDomain: "hackathon-20261.firebaseapp.com",
  projectId: "hackathon-20261",
  storageBucket: "hackathon-20261.firebasestorage.app",
  messagingSenderId: "304419961290",
  appId: "1:304419961290:web:ffc874b1127ed94f757733"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
