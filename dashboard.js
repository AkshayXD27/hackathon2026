import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

document.addEventListener("DOMContentLoaded", () => {
    // Top Level State
    let currentUser = null;
    let currentProfile = null;
    let currentSessionPin = null;
    let isHost = false;
    let sessionUnsubscribe = null;
    let globalBudget = null;
    let globalCurrency = "$";

    // DOM Elements
    const sWelcome = document.getElementById('welcome-section');
    const sPersonalDashboard = document.getElementById('personal-dashboard-section');
    const sLobby = document.getElementById('lobby-section');
    const sInput = document.getElementById('input-section');
    const sCalculating = document.getElementById('calculating-section');
    const sResult = document.getElementById('result-section');

    const welcomeMsg = document.getElementById('pd-welcome-message');
    const dashboardContent = document.getElementById('dashboard-content');
    const loadingSpinner = document.getElementById('loading-spinner');

    const budgetPill = document.getElementById('budget-pill');
    const budgetInput = document.getElementById('budget-input');
    const btnSaveBudget = document.getElementById('btn-save-budget');
    const userCurrency = document.getElementById('user-currency');
    const foodInput = document.getElementById('food-input');
    const foodDay = document.getElementById('food-day');
    const btnLogFood = document.getElementById('btn-log-food');
    const foodList = document.getElementById('food-list');

    // Auth & Init
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await signOut(auth);
    });

    onAuthStateChanged(auth, async (user) => {
        if (!user || (!user.emailVerified && false)) { // Temporarily relaxing emailVerified during hackathon testing
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
                showSection(sPersonalDashboard);
                fetchFoods();
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
        sPersonalDashboard.style.display = 'none';
        sLobby.style.display = 'none';
        sInput.style.display = 'none';
        sCalculating.style.display = 'none';
        sResult.style.display = 'none';
        targetSection.style.display = 'block';
    }

    // Budget Controller
    budgetPill.addEventListener('click', () => {
        budgetPill.style.display = 'none';
        budgetInput.style.display = 'inline-block';
        btnSaveBudget.style.display = 'inline-block';
        budgetInput.focus();
    });

    btnSaveBudget.addEventListener('click', () => {
        const val = budgetInput.value.trim();
        if(val) {
            globalBudget = val;
            globalCurrency = userCurrency.value;
            budgetPill.textContent = "Budget: " + globalCurrency + globalBudget;
            budgetPill.style.background = "rgba(46, 204, 113, 0.1)";
            budgetPill.style.color = "#2ecc71";
            budgetPill.style.border = "1.5px solid rgba(46, 204, 113, 0.5)";
        }
        budgetPill.style.display = 'inline-block';
        budgetInput.style.display = 'none';
        btnSaveBudget.style.display = 'none';
    });

    userCurrency.addEventListener('change', () => {
        if(globalBudget) {
            globalCurrency = userCurrency.value;
            budgetPill.textContent = "Budget: " + globalCurrency + globalBudget;
        }
    });

    // Personal Dashboard Food Logging
    async function fetchFoods() {
        if (!currentUser) return;
        try {
            const res = await fetch(`/api/getFoods?uid=${currentUser.uid}`);
            const data = await res.json();
            foodList.innerHTML = "";
            if (data.success && data.logs.length > 0) {
                data.logs.forEach(log => {
                    const li = document.createElement('li');
                    li.className = 'member-item';
                    const dateDesc = log.date_unix > (Date.now()/1000 - 86400) ? "Today" : "Yesterday";
                    li.innerHTML = `<span>${log.food}</span> <span class="status">${dateDesc}</span>`;
                    foodList.appendChild(li);
                });
            } else {
                foodList.innerHTML = `<p style="color: var(--text-gray);">No foods logged yet.</p>`;
            }
        } catch (e) {
            console.error("Fetch Foods Error:", e);
            foodList.innerHTML = `<p class="error-msg" style="display:block;">Error loading recent foods.</p>`;
        }
    }

    btnLogFood.addEventListener('click', async () => {
        const food = foodInput.value.trim();
        if (!food) return;

        btnLogFood.disabled = true;
        btnLogFood.innerText = "Saving...";
        try {
            const res = await fetch('/api/logFood', {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ uid: currentUser.uid, food: food, dayOffset: foodDay.value })
            });
            const result = await res.json();
            if (result.success) {
                foodInput.value = "";
                await fetchFoods();
            } else {
                alert("Error logging food: " + result.error);
            }
        } catch (e) {
            console.error(e);
            alert("Network error.");
        }
        btnLogFood.disabled = false;
        btnLogFood.innerText = "Log Food";
    });

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
                        triggerEatzyEngine(data); // Host runs the engine
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
        
        // Respect global budget if set, otherwise fallback to the radio selector
        let budget = document.querySelector('input[name="budget"]:checked') ? document.querySelector('input[name="budget"]:checked').value : "Budget";
        if (globalBudget) {
            budget = `${globalCurrency}${globalBudget}`;
        }

        const sessionRef = doc(db, "sessions", currentSessionPin);

        try {
            // Need transaction-like safely pushing to inputs map
            // For hackathon safely fetching and updating:
            const snap = await getDoc(sessionRef);
            const data = snap.data();
            data.inputs = data.inputs || {};
            data.inputs[currentUser.uid] = { 
                cravings, 
                budget,
                username: currentProfile.username,
                dietType: currentProfile.dietType || "None",
                allergies: currentProfile.allergies || []
            };
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
        showSection(sPersonalDashboard);
    });

    // Engine: Trigger Eatzy Engine (Called only by host) via secure Vercel backend
    async function triggerEatzyEngine(sessionData) {
        try {
            // 1. Build AI Prompt using self-reported profiles in inputs (bypasses users collection read permissions)
            let prompt = "GROUP DATA:\n";

            for (const uid of Object.keys(sessionData.members)) {
                const vibe = sessionData.inputs[uid];
                if (vibe) {
                    prompt += `- ${vibe.username || "Unknown"} | Diet: ${vibe.dietType || "None"} | Allergies: ${(vibe.allergies || []).join(", ")} | Cravings right now: ${vibe.cravings} | Max Budget: ${vibe.budget}\n`;
                }
            }

            // 3. Make API Call to your secure Vercel backend endpoint
            const response = await fetch("/api/engine", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ prompt: prompt })
            });

            if (!response.ok) {
                const errData = await response.text();
                throw new Error(`Backend API failed (${response.status}): ${errData}`);
            }

            const aiData = await response.json();
            const verdict = aiData.choices[0].message.content;

            // 4. Update Session Result
            await updateDoc(doc(db, "sessions", currentSessionPin), {
                state: "result",
                resultText: verdict
            });

        } catch (error) {
            console.error("Eatzy Engine Error:", error);
            // Show the actual error to debug
            await updateDoc(doc(db, "sessions", currentSessionPin), {
                state: "result",
                resultText: `Eatzy Engine Error: ${error.message || error}`
            });
        }
    }
});