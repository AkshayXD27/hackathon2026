import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    const welcomeMessage = document.getElementById('welcome-message');
    const dashboardContent = document.getElementById('dashboard-content');
    const loadingSpinner = document.getElementById('loading-spinner');
    const logoutBtn = document.getElementById('logout-btn');

    // Logout Action
    if(logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // The onAuthStateChanged listener will handle redirect
            } catch (error) {
                console.error("Logout Error:", error);
            }
        });
    }

    // Monitor Auth State
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Unverified check
            if (!user.emailVerified) {
                await signOut(auth);
                window.location.href = 'index.html';
                return;
            }

            // Fetch extra profile data
            try {
                const docRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(docRef);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    welcomeMessage.textContent = `Welcome back, ${data.username}!`;
                } else {
                    welcomeMessage.textContent = `Welcome back!`;
                }
                
                loadingSpinner.style.display = 'none';
                dashboardContent.style.display = 'flex';
                
            } catch (error) {
                console.error("Error fetching rules:", error);
                welcomeMessage.textContent = `Welcome back!`;
                loadingSpinner.style.display = 'none';
                dashboardContent.style.display = 'flex';
            }
        } else {
            // Signed out -> Kicked backed to Index
            window.location.href = 'index.html';
        }
    });
});
