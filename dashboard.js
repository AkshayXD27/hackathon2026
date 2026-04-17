import { auth, db } from './firebase-config.js';

// onAuthStateChnaged checks if the user is logged in using firebase auth

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";
// If they are authenticated, it fetches their profile data from a Firestore users collection, sets up their preferred currency and budget, and dynamically renders their personal dashboard.

/* Group engine It uses Firestore's real-time listeners (onSnapshot) to create a synchronized multiplayer room where friends can agree on what to eat.Lobby (state: "lobby"): * The Host clicks "Create Group," which generates a 4-digit PIN and creates a new sessions document in the database.

Guests enter the PIN to join. The DOM dynamically updates to show a live list of everyone in the room.

Input (state: "input"):

The Host starts the engine. A 60-second timer begins ticking down locally.

Users type in their current craving and budget. Clicking "Lock In" saves their preferences to the shared session document.

Calculating (state: "calculating"):

Once the database detects that the number of locked-in inputs matches the number of members, the Host's client automatically advances the state.

The UI switches to a loading screen for everyone.

Then we constructs a prompt combining everyone's usernames, dietary restrictions, allergies, and current cravings, then fires a POST request to the backend LLM

*/

document.addEventListener("DOMContentLoaded", () => {
    // Top Level State
    let currentUser = null;
    let currentProfile = null;
    let currentSessionPin = null;
    let isHost = false;
    let sessionUnsubscribe = null;
    let globalBudget = null;
    let globalCurrency = "$";
    let timerInterval = null;

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

                // Handle global budget loading
                if (currentProfile.globalBudget) {
                    globalBudget = currentProfile.globalBudget;
                    globalCurrency = currentProfile.globalCurrency || "$";
                    userCurrency.value = globalCurrency;
                    budgetPill.textContent = "Budget: " + globalCurrency + globalBudget;
                    budgetPill.style.background = "rgba(46, 204, 113, 0.1)";
                    budgetPill.style.color = "#2ecc71";
                    budgetPill.style.border = "1.5px solid rgba(46, 204, 113, 0.5)";
                }

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

    function showSection(targetSection) {
        sWelcome.style.display = 'none';
        sPersonalDashboard.style.display = 'none';
        sLobby.style.display = 'none';
        sInput.style.display = 'none';
        sCalculating.style.display = 'none';
        sResult.style.display = 'none';
        targetSection.style.display = 'block';
    }

    // Top Nav Tabs
    document.getElementById('link-home').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('link-home').classList.add('active');
        document.getElementById('link-engine').classList.remove('active');
        if (sessionUnsubscribe) sessionUnsubscribe();
        currentSessionPin = null;
        isHost = false;
        showSection(sPersonalDashboard);
    });

    document.getElementById('link-engine').addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('link-engine').classList.add('active');
        document.getElementById('link-home').classList.remove('active');
        showSection(sWelcome);
    });

    // Budget Controller
    budgetPill.addEventListener('click', () => {
        budgetPill.style.display = 'none';
        budgetInput.style.display = 'inline-block';
        btnSaveBudget.style.display = 'inline-block';
        budgetInput.focus();
    });

    btnSaveBudget.addEventListener('click', async () => {
        const val = budgetInput.value.trim();
        if(val) {
            globalBudget = val;
            globalCurrency = userCurrency.value;
            budgetPill.textContent = "Budget: " + globalCurrency + globalBudget;
            budgetPill.style.background = "rgba(46, 204, 113, 0.1)";
            budgetPill.style.color = "#2ecc71";
            budgetPill.style.border = "1.5px solid rgba(46, 204, 113, 0.5)";

            // Save to Firebase
            try {
                if (currentUser) {
                    await updateDoc(doc(db, "users", currentUser.uid), {
                        globalBudget: globalBudget,
                        globalCurrency: globalCurrency
                    });
                }
            } catch (err) {
                console.error("Budget save error:", err);
            }
        }
        budgetPill.style.display = 'inline-block';
        budgetInput.style.display = 'none';
        btnSaveBudget.style.display = 'none';
    });

    userCurrency.addEventListener('change', async () => {
        globalCurrency = userCurrency.value;
        if(globalBudget) {
            budgetPill.textContent = "Budget: " + globalCurrency + globalBudget;
        }
        // Save to Firebase on select change naturally
        try {
            if (currentUser) {
                await updateDoc(doc(db, "users", currentUser.uid), {
                    globalCurrency: globalCurrency
                });
            }
        } catch (err) {
            console.error("Currency save error:", err);
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
                    li.style.display = 'flex';
                    li.style.justifyContent = 'space-between';
                    const d = new Date(log.date_unix * 1000);
                    const formattedTime = d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                    // Basic heuristic for today/yesterday display
                    const dateDesc = log.date_unix > (Date.now()/1000 - 86400) ? "Today" : "Yesterday";
                    
                    li.innerHTML = `
                        <div>
                            <span style="font-weight: 700; color: var(--primary-color);">${log.food}</span>
                            <span class="status" style="margin-left: 0.5rem; color: #999;">${dateDesc} at ${formattedTime}</span>
                        </div>
                        <button class="delete-log-btn" data-id="${log._id}" style="background: none; border: none; cursor: pointer; font-size: 1.2rem; transition: transform 0.2s;" title="Delete Log">❌</button>
                    `;
                    foodList.appendChild(li);
                });

                // Attach delete listeners
                document.querySelectorAll('.delete-log-btn').forEach(btn => {
                    btn.addEventListener('click', async (e) => {
                        const logId = e.currentTarget.getAttribute('data-id');
                        e.currentTarget.style.opacity = '0.5';
                        try {
                            const res = await fetch(`/api/logFood?id=${logId}`, { method: "DELETE" });
                            if (res.ok) fetchFoods();
                        } catch (err) {
                            console.error("Delete failed", err);
                            e.currentTarget.style.opacity = '1';
                        }
                    });
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

    // Wheel Logic (Home)
    const wheelInput = document.getElementById('wheel-input');
    const btnAddWheel = document.getElementById('btn-add-wheel');
    const wheelItemsList = document.getElementById('wheel-items-list');
    const btnSpinWheel = document.getElementById('btn-spin-wheel');
    const btnSurpriseMe = document.getElementById('btn-surprise-me');
    const wheelElement = document.getElementById('wheel');
    const wheelResultMsg = document.getElementById('wheel-result-msg');
    
    let wItems = ["Pizza", "Burgers", "Sushi", "Salad", "Tacos"];
    let currentRotation = 0;

    function renderWheelTags() {
        if(!wheelItemsList) return;
        wheelItemsList.innerHTML = "";
        wItems.forEach((it, idx) => {
            const span = document.createElement('span');
            span.style.background = `hsl(${(idx * 360) / wItems.length}, 70%, 85%)`;
            span.style.padding = '0.3rem 0.8rem';
            span.style.borderRadius = '15px';
            span.style.fontSize = '0.9rem';
            span.style.color = "var(--text-dark)";
            span.style.fontWeight = "600";
            span.innerText = it;
            
            const del = document.createElement('span');
            del.innerText = " ×";
            del.style.cursor = "pointer";
            del.onclick = () => { wItems.splice(idx, 1); renderWheelTags(); };
            span.appendChild(del);
            
            wheelItemsList.appendChild(span);
        });

        // Update wheel gradient
        if(wItems.length > 0) {
            let grad = [];
            let slice = 360 / wItems.length;
            for(let i=0; i<wItems.length; i++){
                let color = `hsl(${(i * 360) / wItems.length}, 70%, 85%)`;
                grad.push(`${color} ${i*slice}deg ${(i+1)*slice}deg`);
            }
            if(wheelElement) wheelElement.style.background = `conic-gradient(${grad.join(", ")})`;
        } else {
            if(wheelElement) wheelElement.style.background = "#ccc";
        }
    }
    
    btnAddWheel?.addEventListener('click', () => {
        if(wheelInput.value.trim() && wItems.length < 15) {
            wItems.push(wheelInput.value.trim());
            wheelInput.value = "";
            renderWheelTags();
        }
    });

    btnSpinWheel?.addEventListener('click', () => {
        if(wItems.length === 0) return;
        btnSpinWheel.disabled = true;
        wheelResultMsg.innerText = "Spinning...";
        wheelResultMsg.style.color = "var(--text-gray)";
        
        const spins = Math.floor(Math.random() * 5) + 5; // 5 to 9 full spins
        const slice = 360 / wItems.length;
        const randomDegree = Math.floor(Math.random() * 360);
        
        currentRotation += (spins * 360) + randomDegree;
        wheelElement.style.transform = `rotate(${currentRotation}deg)`;
        
        setTimeout(() => {
            // Calculate winner
            let actualRot = currentRotation % 360;
            let pointingPhase = (360 - actualRot) % 360;
            let winningIndex = Math.floor(pointingPhase / slice);
            
            wheelResultMsg.style.color = "var(--primary-color)";
            wheelResultMsg.innerText = `Landed on: ${wItems[winningIndex]}! 🎉`;
            btnSpinWheel.disabled = false;
        }, 4000);
    });

    if(wheelItemsList) renderWheelTags();

    // Personal AI Surprise Hook
    btnSurpriseMe?.addEventListener('click', async () => {
        if(!currentUser) return;
        btnSurpriseMe.disabled = true;
        btnSurpriseMe.innerText = "Asking AI...";
        wheelResultMsg.innerText = "AI is looking at your history...";
        wheelResultMsg.style.color = "var(--text-gray)";
        try {
            const res = await fetch("/api/personalEngine", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    uid: currentUser.uid,
                    username: currentProfile.username,
                    budget: globalBudget ? `${globalCurrency}${globalBudget}` : "Moderate",
                    dietType: currentProfile.dietType || "None",
                    allergies: currentProfile.allergies || []
                })
            });
            const data = await res.json();
            if(res.ok && data.verdict) {
                wheelResultMsg.style.color = "var(--primary-color)";
                wheelResultMsg.innerText = `AI Says: ${data.verdict.foodName}!\n${data.verdict.explanation}`;
            } else {
                wheelResultMsg.innerText = "AI couldn't decide!";
            }
        } catch(e) {
            console.error(e);
            wheelResultMsg.innerText = "Error contacting AI.";
        }
        btnSurpriseMe.disabled = false;
        btnSurpriseMe.innerText = "Surprise Me (AI)";
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

                const btnLock = document.getElementById('btn-lock-in');
                const elTimer = document.getElementById('countdown-timer');

                // Timer Logic
                if (!timerInterval && data.inputStartTime) {
                    timerInterval = setInterval(() => {
                        const elapsed = Math.floor((Date.now() - data.inputStartTime) / 1000);
                        let left = 60 - elapsed;
                        if (left < 0) left = 0;
                        if (elTimer) elTimer.innerText = left;
                        
                        if (left === 0) {
                            clearInterval(timerInterval);
                            timerInterval = null;
                            if (btnLock && !btnLock.disabled) {
                                btnLock.click();
                            }
                        }
                    }, 1000);
                }

                // If I already submitted, show waiting msg
                if (data.inputs && data.inputs[currentUser.uid]) {
                    btnLock.style.display = 'none';
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
            await updateDoc(doc(db, "sessions", currentSessionPin), { 
                state: "input",
                inputStartTime: Date.now() 
            });
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
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        
        currentSessionPin = null;
        isHost = false;
        document.getElementById('join-form').style.display = 'none';
        document.getElementById('pin-input').value = "";
        
        // Reset the Lock In Button to fix the 'Saving...' stuck bug
        const btnLock = document.getElementById('btn-lock-in');
        btnLock.innerText = "Lock In Choice";
        btnLock.disabled = false;
        btnLock.style.display = 'block';
        document.getElementById('lock-waiting-msg').style.display = 'none';
        document.getElementById('craving-input').value = "";

        showSection(sPersonalDashboard);
    });

    // Engine: Trigger Eatzy Engine (Called only by host) via secure Vercel backend
    async function triggerEatzyEngine(sessionData) {
        try {
            // 1. Build AI Prompt using self-reported profiles in inputs (bypasses users collection read permissions)
            let prompt = "GROUP DATA:\n";
            let membersMap = {};

            for (const uid of Object.keys(sessionData.members)) {
                membersMap[uid] = sessionData.members[uid].name || "Unknown";
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
                body: JSON.stringify({ prompt: prompt, membersMap: membersMap })
            });

            if (!response.ok) {
                const errData = await response.text();
                throw new Error(`Backend API failed (${response.status}): ${errData}`);
            }

            const aiData = await response.json();
            const verdictObj = aiData.verdict || { foodName: "Error", explanation: "Failed to generate." };
            const finalVerdict = `🏆 ${verdictObj.foodName} 🏆\n\n${verdictObj.explanation}`;

            // 4. Update Session Result
            await updateDoc(doc(db, "sessions", currentSessionPin), {
                state: "result",
                resultText: finalVerdict
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
