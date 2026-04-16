import { auth, db } from './firebase-config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    // 1. Initial Reveal Animations
    const elementsToReveal = [
        document.querySelector('.hero-content h1'),
        document.querySelector('.hero-content p'),
        document.querySelector('.cta-btn'),
        ...document.querySelectorAll('.card')
    ];

    elementsToReveal.forEach((el, index) => {
        if (!el) return;
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px)';
        el.style.transition = `opacity 0.8s cubic-bezier(0.165, 0.84, 0.44, 1) ${index * 0.1}s, 
                               transform 0.8s cubic-bezier(0.165, 0.84, 0.44, 1) ${index * 0.1}s`;
        
        void el.offsetWidth;
        
        setTimeout(() => {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
            if (el.classList.contains('card')) {
                setTimeout(() => {
                    el.style.transition = '';
                }, 800 + index * 100);
            }
        }, 100);
    });

    // 3D Tilt Effect on Cards
    const cards = document.querySelectorAll('.card');
    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            
            const rotateX = ((y - centerY) / centerY) * -15;
            const rotateY = ((x - centerX) / centerX) * 15;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-12px) scale(1.05)`;
            card.style.transition = `transform 0.1s ease`;
            card.style.zIndex = '20';
            card.style.boxShadow = `0 30px 60px rgba(0,0,0,0.12), ${-rotateY}px ${rotateX}px 20px rgba(250, 140, 53, 0.1)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = `perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px) scale(1)`;
            card.style.transition = `transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.5s ease`;
            card.style.zIndex = '3';
            card.style.boxShadow = `0 20px 45px rgba(0,0,0,0.08)`;
            if (card.classList.contains('card-birthday')) {
                card.style.zIndex = '1';
            }
        });
    });

    // 2. Modal Overlay Logic
    const loginBtn = document.getElementById('login-btn');
    const modalOverlay = document.getElementById('auth-modal');
    const closeModalBtn = document.getElementById('close-modal');
    
    const modalForm = document.getElementById('modal-form');
    const toggleLink = document.getElementById('modal-toggle-link');
    const toggleText = document.getElementById('modal-toggle-text');
    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const submitBtn = document.getElementById('modal-submit-btn');
    const errorMsg = document.getElementById('modal-error-msg');
    const successMsg = document.getElementById('modal-success-msg');
    
    // Form views
    const loginFields = document.getElementById('login-fields');
    const signupFields = document.getElementById('signup-fields');
    
    let isLoginMode = true;

    if (loginBtn && modalOverlay) {
        loginBtn.addEventListener('click', () => {
            modalOverlay.classList.add('active');
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
        });
    }

    // Close on outside click
    window.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            modalOverlay.classList.remove('active');
        }
    });

    // 3. Toggle Authentication Mode
    toggleLink.addEventListener('click', (e) => {
        e.preventDefault();
        isLoginMode = !isLoginMode;
        
        errorMsg.style.display = 'none';
        successMsg.style.display = 'none';
        
        if (isLoginMode) {
            modalTitle.textContent = 'Welcome Back';
            modalSubtitle.textContent = 'Log in to your account';
            submitBtn.textContent = 'Log In';
            toggleText.textContent = "Don't have an account?";
            toggleLink.textContent = 'Sign Up';
            
            signupFields.style.display = 'none';
        } else {
            modalTitle.textContent = 'Create Account';
            modalSubtitle.textContent = 'Sign up for Eatzy';
            submitBtn.textContent = 'Sign Up';
            toggleText.textContent = "Already have an account?";
            toggleLink.textContent = 'Log In';
            
            signupFields.style.display = 'block';
        }
    });

    // Handle "None" allergy exclusion
    const allergyNoneCheck = document.getElementById('allergy-none');
    const allergyOptions = document.querySelectorAll('.allergy-option');
    
    if(allergyNoneCheck) {
        allergyNoneCheck.addEventListener('change', (e) => {
            if(e.target.checked) {
                allergyOptions.forEach(opt => opt.checked = false);
            }
        });
        
        allergyOptions.forEach(opt => {
            opt.addEventListener('change', () => {
                if(opt.checked) {
                    allergyNoneCheck.checked = false;
                }
            });
        });
    }

    // 4. Form Submission and Firebase Action
    modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        errorMsg.style.display = 'none';
        successMsg.style.display = 'none';
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        submitBtn.disabled = true;
        submitBtn.textContent = 'Please wait...';
        submitBtn.style.opacity = '0.7';

        try {
            if (isLoginMode) {
                // LOG IN
                const userCredential = await signInWithEmailAndPassword(auth, email, password);
                
                // Block if unverified
                if (!userCredential.user.emailVerified) {
                    await signOut(auth);
                    throw new Error("Please verify your email address before logging in.");
                }
                
                successMsg.textContent = 'Login successful! Redirecting...';
                successMsg.style.display = 'block';
                setTimeout(() => {
                    window.location.href = 'dashboard.html';
                }, 1200);
                
            } else {
                // SIGN UP
                const username = document.getElementById('username').value;
                if(!username.trim()) throw new Error("Username is required.");
                
                const dietType = document.querySelector('input[name="diet"]:checked').value;
                const dietGoal = document.getElementById('diet-goal').value;
                
                let allergies = [];
                if (allergyNoneCheck.checked) {
                    allergies = ['none'];
                } else {
                    document.querySelectorAll('.allergy-option:checked').forEach(checkbox => {
                        allergies.push(checkbox.value);
                    });
                }
                
                // Register
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                
                // Send Verify Email
                await sendEmailVerification(user);
                
                // Write Details to Firestore using the user's uid document
                await setDoc(doc(db, "users", user.uid), {
                    username: username,
                    dietType: dietType,
                    allergies: allergies,
                    dietGoal: dietGoal,
                    email: email,
                    createdAt: new Date().toISOString()
                });
                
                // Immedately kick them out (don't leave them signed in until verified)
                await signOut(auth);
                
                successMsg.textContent = 'Account created successfully! A verification email has been sent to your address. Please verify it before logging in.';
                successMsg.style.display = 'block';
                
                // Switch them back to login view but leave the success message
                setTimeout(() => {
                    if(!isLoginMode) toggleLink.click();
                    successMsg.style.display = 'block';
                    successMsg.textContent = "Please check your inbox and verify your email before logging in.";
                }, 4000);
            }
        } catch (error) {
            let userFriendlyMessage = error.message;
            if (error.code === 'auth/email-already-in-use') {
                userFriendlyMessage = "This email is already registered.";
            } else if (error.code === 'auth/invalid-login-credentials' || error.code === 'auth/wrong-password') {
                userFriendlyMessage = "Invalid email or password.";
            } else if (error.code === 'auth/weak-password') {
                userFriendlyMessage = "Password should be at least 6 characters.";
            }

            errorMsg.textContent = userFriendlyMessage;
            errorMsg.style.display = 'block';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = isLoginMode ? 'Log In' : 'Sign Up';
            submitBtn.style.opacity = '1';
        }
    });
});
