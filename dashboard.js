import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

const AI_API_KEY = "vck_5ipRm2krp7pplL6oKfo4fiZPNTOgIq50IoP66onmrIEz2PM8rh12xVp4";

document.addEventListener("DOMContentLoaded", () => {
    // Top Level State
    let currentUser = null;
    let currentProfile = null;
    let currentSessionPin = null;
    let isHost = false;
    let sessionUnsubscribe = null;

    // DOM Elements
    const sWelcome = document.getElementById('welcome-section');
    const sLobby = document.getElementById('lobby-section');
    const sInput = document.getElementById('input-section');
    const sCalculating = document.getElementById('calculating-section');
    const sResult = document.getElementById('result-section');

    const welcomeMsg = document.getElementById('welcome-message');
    const dashboardContent = document.getElementById('dashboard-content');
    const loadingSpinner = document.getElementById('loading-spinner');

    // Auth & Init
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
    });

    onAuthStateChanged(auth, async (user) => {
        if (!user || (!user.emailVerified && false)) { // Temporarily relaxing emailVerified during hackathon testing might be wise, but keeping true to previous logic:
            if (!user) { window.location.href = 'index.html'; return; }
        }

        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (docSnap.exists()) {
                currentProfile = docSnap.data();
                currentUser = user;
                welcomeMsg.textContent = `Hey, ${currentProfile.username}!`;

                loadingSpinner.style.display = 'none';
                dashboardContent.style.display = 'flex';
                showSection(sWelcome);
            } else {
                window.location.href = 'index.html';
            }
        } catch (error) {
            console.error("Dashboard Init Error", error);
            window.location.href = 'index.html';
        }
    });

    // View Routing
    function showSection(targetSection) {
        sWelcome.style.display = 'none';
        sLobby.style.display = 'none';
        sInput.style.display = 'none';
        sCalculating.style.display = 'none';
        sResult.style.display = 'none';
        targetSection.style.display = 'block';
    }

    // 1. Create Group
    document.getElementById('btn-create-group').addEventListener('click', async () => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4 digit PIN
        currentSessionPin = pin;
        isHost = true;

        await setDoc(doc(db, "sessions", pin), {
            hostId: currentUser.uid,
            state: "lobby",
            members: {
                [currentUser.uid]: { name: currentProfile.username }
            },
            inputs: {},
            resultText: ""
        });

        document.getElementById('lobby-pin').textContent = pin;
        listenToSession(pin);
    });

    // 2. Join Group
    document.getElementById('btn-show-join').addEventListener('click', () => {
        document.getElementById('join-form').style.display = 'block';
    });

    document.getElementById('btn-join-submit').addEventListener('click', async () => {
        const pin = document.getElementById('pin-input').value.toUpperCase().trim();
        const err = document.getElementById('join-error');
        err.style.display = 'none';

        if (pin.length < 4) { err.textContent = "Invalid PIN"; err.style.display = 'block'; return; }

        try {
            const sessionRef = doc(db, "sessions", pin);
            const snap = await getDoc(sessionRef);
            if (!snap.exists()) {
                err.textContent = "Session not found.";
                err.style.display = 'block';
                return;
            }

            // Update session
            const data = snap.data();
            data.members[currentUser.uid] = { name: currentProfile.username };
            await updateDoc(sessionRef, { members: data.members });

            currentSessionPin = pin;
            isHost = false;
            document.getElementById('lobby-pin').textContent = pin;
            listenToSession(pin);

        } catch (e) {
            console.error("Join Error: ", e);
            err.textContent = "Error joining session.";
            err.style.display = 'block';
        }
    });

    // Main Game Loop Listener
    function listenToSession(pin) {
        if (sessionUnsubscribe) sessionUnsubscribe();

        sessionUnsubscribe = onSnapshot(doc(db, "sessions", pin), async (snap) => {
            if (!snap.exists()) return;
            const data = snap.data();

            // State: LOBBY
            if (data.state === "lobby") {
                showSection(sLobby);
                const ul = document.getElementById('member-list');
                ul.innerHTML = "";
                const memberKeys = Object.keys(data.members);

                memberKeys.forEach(uid => {
                    const li = document.createElement('li');
                    li.className = 'member-item';
                    li.innerHTML = `${data.members[uid].name} ${uid === data.hostId ? '<span class="status">Host</span>' : '<span class="status">Joined</span>'}`;
                    ul.appendChild(li);
                });

                if (isHost && memberKeys.length > 1) {
                    document.getElementById('btn-start-engine').style.display = 'block';
                    document.getElementById('host-waiting-msg').style.display = 'none';
                } else if (!isHost) {
                    document.getElementById('btn-start-engine').style.display = 'none';
                    document.getElementById('host-waiting-msg').style.display = 'block';
                }
            }

            // State: INPUT
            if (data.state === "input") {
                showSection(sInput);

                // If I already submitted, show waiting msg
                if (data.inputs[currentUser.uid]) {
                    document.getElementById('btn-lock-in').style.display = 'none';
                    document.getElementById('lock-waiting-msg').style.display = 'block';
                } else {
                    document.getElementById('btn-lock-in').style.display = 'block';
                    document.getElementById('lock-waiting-msg').style.display = 'none';
                }

                // If Host: check if everyone submitted
                if (isHost) {
                    const memberCount = Object.keys(data.members).length;
                    const inputCount = Object.keys(data.inputs || {}).length;
                    if (memberCount === inputCount && memberCount > 0) {
                        // Everyone locked in -> move to calculating
                        await updateDoc(doc(db, "sessions", pin), { state: "calculating" });
                        triggerVeniceAI(data); // Host runs the engine
                    }
                }
            }

            // State: CALCULATING
            if (data.state === "calculating") {
                showSection(sCalculating);
            }

            // State: RESULT
            if (data.state === "result") {
                showSection(sResult);
                document.getElementById('result-text').innerText = data.resultText;
            }
        });
    }

    // Lobby: Start Engine (Host only)
    document.getElementById('btn-start-engine').addEventListener('click', async () => {
        if (isHost && currentSessionPin) {
            await updateDoc(doc(db, "sessions", currentSessionPin), { state: "input" });
        }
    });

    // Input: Lock in vibe
    document.getElementById('btn-lock-in').addEventListener('click', async () => {
        if (!currentSessionPin) return;
        const btn = document.getElementById('btn-lock-in');
        btn.innerText = "Saving...";
        btn.disabled = true;

        const cravings = document.getElementById('craving-input').value || "Surprise me!";
        const budget = document.querySelector('input[name="budget"]:checked').value;

        const sessionRef = doc(db, "sessions", currentSessionPin);

        try {
            // Need transaction-like safely pushing to inputs map
            // For hackathon safely fetching and updating:
            const snap = await getDoc(sessionRef);
            const data = snap.data();
            data.inputs = data.inputs || {};
            data.inputs[currentUser.uid] = { cravings, budget };
            await updateDoc(sessionRef, { inputs: data.inputs });

            btn.style.display = 'none';
            document.getElementById('lock-waiting-msg').style.display = 'block';
        } catch (e) {
            console.error(e);
            btn.innerText = "Error. Try again.";
            btn.disabled = false;
        }
    });

    // Start Over
    document.getElementById('btn-new-decision').addEventListener('click', () => {
        if (sessionUnsubscribe) sessionUnsubscribe();
        currentSessionPin = null;
        isHost = false;
        document.getElementById('join-form').style.display = 'none';
        document.getElementById('pin-input').value = "";
        showSection(sWelcome);
    });

    // Engine: Trigger Venice AI (Called only by host)
    async function triggerVeniceAI(sessionData) {
        try {
            // 1. Gather Profiles
            const memberProfiles = {};
            for (const uid of Object.keys(sessionData.members)) {
                const snap = await getDoc(doc(db, "users", uid));
                if (snap.exists()) memberProfiles[uid] = snap.data();
            }

            // 2. Build AI Prompt
            let prompt = "You are the 'Eatzy Group Food Engine'. Your goal is to rapidly find a perfect common dinner recommendation that maximizes group satisfaction based on the following friends' constraints and desires. Provide a clean, specific recommendation and a 2 sentence explanation of why it works for everyone. Do not output markdown, just clean text.\n\nGROUP DATA:\n";

            for (const uid of Object.keys(sessionData.members)) {
                const profile = memberProfiles[uid];
                const vibe = sessionData.inputs[uid];
                prompt += `- ${profile.username} | Diet: ${profile.dietType} | Allergies: ${profile.allergies.join(", ")} | Cravings right now: ${vibe.cravings} | Max Budget: ${vibe.budget}\n`;
            }
            prompt += "\nSelect exactly one meal idea/cuisine. Deliver the final verdict directly.";

            // 3. Make API Call natively compatible with OpenRouter given the sk-or-v1 key format
            const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${AI_API_KEY}`,
                    "Content-Type": "application/json",
                    "HTTP-Referer": window.location.href, // Required by OpenRouter
                    "X-Title": "Eatzy App"
                },
                body: JSON.stringify({
                    model: "openrouter/auto",
                    messages: [
                        { role: "system", content: "You are the Eatzy engine. Return only the final restaurant/cuisine recommendation." },
                        { role: "user", content: prompt }
                    ]
                })
            });

            if (!response.ok) throw new Error("API failed");

            const aiData = await response.json();
            const verdict = aiData.choices[0].message.content;

            // 4. Update Session Result
            await updateDoc(doc(db, "sessions", currentSessionPin), {
                state: "result",
                resultText: verdict
            });

        } catch (error) {
            console.error("Venice Engine Error:", error);
            // Fallback just in case
            await updateDoc(doc(db, "sessions", currentSessionPin), {
                state: "result",
                resultText: "Eatzy Engine hiccuped! But a local wood-fired Pizza place usually covers all bases."
            });
        }
    }
});
