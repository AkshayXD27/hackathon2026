import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
    const authForm = document.getElementById('auth-form');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitBtn = document.getElementById('submit-btn');
    const formTitle = document.getElementById('form-title');
    const formSubtitle = document.getElementById('form-subtitle');
    const toggleLink = document.getElementById('toggle-link');
    const toggleText = document.getElementById('toggle-text');
    const errorMsg = document.getElementById('error-msg');
    const successMsg = document.getElementById('success-msg');

    let isLoginMode = true;

    // Toggle between Sign In and Sign Up
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        
        errorMsg.style.display = 'none';
        successMsg.style.display = 'none';
        
        if (isLoginMode) {
            formTitle.textContent = 'Welcome Back';
            formSubtitle.textContent = 'Log in to your account';
            submitBtn.textContent = 'Log In';
            toggleText.textContent = "Don't have an account?";
            toggleLink.textContent = 'Sign Up';
        } else {
            formTitle.textContent = 'Create Account';
            formSubtitle.textContent = 'Sign up for EatsNow';
            submitBtn.textContent = 'Sign Up';
            toggleText.textContent = "Already have an account?";
            toggleLink.textContent = 'Log In';
        }
    });

    // Logo click goes home
    document.querySelector('.logo').addEventListener('click', () => {
        window.location.href = 'index.html';
    });

    // Handle form submission
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = emailInput.value;
        const password = passwordInput.value;
        
        errorMsg.style.display = 'none';
        successMsg.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Please wait...';
        submitBtn.style.opacity = '0.7';

        try {
            if (isLoginMode) {
                // Sign In
                await signInWithEmailAndPassword(auth, email, password);
                successMsg.textContent = 'Login successful! Redirecting...';
                successMsg.style.display = 'block';
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            } else {
                // Sign Up
                await createUserWithEmailAndPassword(auth, email, password);
                successMsg.textContent = 'Account created successfully! Redirecting...';
                successMsg.style.display = 'block';
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 1500);
            }
        } catch (error) {
            // Clean up Firebase error messages for better UX
            let userFriendlyMessage = error.message;
            if (error.code === 'auth/email-already-in-use') {
                userFriendlyMessage = "This email is already registered.";
            } else if (error.code === 'auth/invalid-credential' || error.code === 'auth/invalid-login-credentials' || error.code === 'auth/wrong-password') {
                userFriendlyMessage = "Invalid email or password.";
            } else if (error.code === 'auth/weak-password') {
                userFriendlyMessage = "Password should be at least 6 characters.";
            }

            errorMsg.textContent = userFriendlyMessage;
            errorMsg.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
            submitBtn.style.opacity = '1';
        }
    });
});
