const DB_KEY = 'finzen_user_v2';
const THEME_KEY = 'finzen_theme';
let expenseChart = null; // Store chart instance

document.addEventListener('DOMContentLoaded', () => {
    loadTheme();
    const storedData = localStorage.getItem(DB_KEY);
    if (storedData) {
        const userData = JSON.parse(storedData);
        initializeApp(userData);
    } else {
        document.getElementById('main-header').classList.add('hidden');
    }
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('profile-menu');
        const avatar = document.getElementById('header-avatar');
        if (!menu.contains(e.target) && !avatar.contains(e.target)) menu.classList.remove('open');
    });
    // NEW: Toggle "Gig Work" checkbox based on Transaction Type
    const typeSelect = document.getElementById('t-type');
    typeSelect.addEventListener('change', (e) => {
        const gigGroup = document.getElementById('gig-toggle-group');
        if (e.target.value === 'income') {
            gigGroup.classList.remove('hidden');
        } else {
            gigGroup.classList.add('hidden');
            document.getElementById('t-is-gig').checked = false; // Reset if switching back
        }
    });
});

// --- CHART LOGIC ---
function renderChart(transactions) {
    const ctx = document.getElementById('expenseChart').getContext('2d');
    const noDataMsg = document.getElementById('no-chart-data');
    
    // Filter only expenses
    const expenses = transactions.filter(t => t.type === 'expense');
    
    if (expenses.length === 0) {
        noDataMsg.classList.remove('hidden');
        if(expenseChart) {
            expenseChart.destroy();
            expenseChart = null;
        }
        return;
    }
    
    noDataMsg.classList.add('hidden');

    // Group by Category
    const categories = {};
    expenses.forEach(t => {
        if (!categories[t.category]) categories[t.category] = 0;
        categories[t.category] += t.amount;
    });

    const data = {
        labels: Object.keys(categories),
        datasets: [{
            data: Object.values(categories),
            backgroundColor: ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'],
            borderWidth: 0,
            hoverOffset: 4
        }]
    };

    // Destroy old chart if exists to avoid "flicker" or duplicates
    if (expenseChart) expenseChart.destroy();

    // Create New Chart
    expenseChart = new Chart(ctx, {
        type: 'doughnut',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            },
            cutout: '70%' // Makes it a donut
        }
    });
}

// --- TRANSACTION LOGIC ---
function toggleModal() {
    const modal = document.getElementById('transaction-modal');
    modal.classList.toggle('open');
}

function handleTransactionSubmit(e) {
    e.preventDefault();
    const desc = document.getElementById('t-desc').value;
    const amount = parseFloat(document.getElementById('t-amount').value);
    const type = document.getElementById('t-type').value;
    const category = document.getElementById('t-category').value;
    
    // NEW: Get Gig Status
    const isGig = document.getElementById('t-is-gig').checked;

    const userData = JSON.parse(localStorage.getItem(DB_KEY));

    const newTransaction = {
        id: Date.now(),
        desc: desc,
        amount: amount,
        type: type,
        category: category,
        isGig: isGig, // Save the tag
        date: new Date().toLocaleDateString()
    };

    userData.transactions.unshift(newTransaction);
    
    if(type === 'expense') userData.balance -= amount;
    else userData.balance += amount;

    localStorage.setItem(DB_KEY, JSON.stringify(userData));
    
    e.target.reset();
    toggleModal();
    // Reset the toggle visibility for next time
    document.getElementById('gig-toggle-group').classList.add('hidden');
    
    renderDashboard(userData);
}

function renderDashboard(user) {
    document.getElementById('dash-balance').innerText = `$${user.balance.toFixed(2)}`;
    
    let totalIncome = user.monthlyIncome;
    let totalExpense = 0;

    let fixedIncome = user.monthlyIncome; 
    let gigIncome = 0;

    user.transactions.forEach(t => {
        if(t.type === 'income') {
            totalIncome += t.amount;
            if (t.isGig) {
                gigIncome += t.amount;
            } else {
                fixedIncome += t.amount;
            }
        }
        if(t.type === 'expense') totalExpense += t.amount;
    });

    document.getElementById('dash-income').innerText = `+$${totalIncome.toFixed(0)}`;
    document.getElementById('dash-expense').innerText = `-$${totalExpense.toFixed(0)}`;

    document.getElementById('income-breakdown').innerHTML = 
        `Fixed: <b>$${fixedIncome.toFixed(0)}</b> | Gig: <b>$${gigIncome.toFixed(0)}</b>`;

    // Check if we already have a tip for today to avoid spamming API
    const lastTipDate = localStorage.getItem('finzen_last_tip_date');
    const today = new Date().toDateString();

    if (lastTipDate !== today && user.transactions.length > 0) {
        // Show the card
        document.getElementById('ai-nudge-card').style.display = 'block';
        
        // Call AI (reuse your chat endpoint logic but with a different prompt)
        fetchProactiveTip(user);
    } else if (localStorage.getItem('finzen_today_tip')) {
        // Show cached tip
        document.getElementById('ai-nudge-card').style.display = 'block';
        document.getElementById('ai-nudge-text').innerText = localStorage.getItem('finzen_today_tip');
    }

    // --- PROACTIVE NUDGE LOGIC ---
    async function fetchProactiveTip(user) {
        const nudgeCard = document.getElementById('ai-nudge-card');
        const nudgeText = document.getElementById('ai-nudge-text');
        
        // 1. Check if we already have a tip for TODAY stored locally
        const today = new Date().toDateString(); // e.g., "Fri Nov 10 2025"
        const storedDate = localStorage.getItem('finzen_tip_date');
        const storedTip = localStorage.getItem('finzen_tip_text');

        if (storedDate === today && storedTip) {
            // We have a tip for today! Show it instantly.
            nudgeText.innerText = storedTip;
            nudgeCard.style.display = 'block';
            return;
        }

        // 2. If no tip for today, show loading state
        nudgeCard.style.display = 'block';
        nudgeText.innerText = "Analyzing your spending...";

        try {
            // 3. Send a "System Prompt" disguised as a message
            // We ask the AI to be brief and direct.
            const systemPrompt = "Analyze my recent transaction history and balance. Provide ONE single, short, proactive sentence of advice, warning, or praise based on this specific data. Do not say 'Based on your data', just state the advice.";

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: systemPrompt, 
                    userContext: user 
                })
            });

            const data = await response.json();

            // 4. Update UI and Save to LocalStorage
            if (data.reply) {
                nudgeText.innerText = data.reply;
                
                // Save it so we don't ask again today
                localStorage.setItem('finzen_tip_date', today);
                localStorage.setItem('finzen_tip_text', data.reply);
            }

        } catch (error) {
            console.error("Nudge Error:", error);
            nudgeCard.style.display = 'none'; // Hide card if AI fails
        }
    }
    
    // RENDER CHART HERE
    renderChart(user.transactions);

    // Only show if the user actually has transactions to analyze
    if (user.transactions.length > 0) {
        fetchProactiveTip(user);
    } else {
        document.getElementById('ai-nudge-card').style.display = 'none';
    }

    const list = document.getElementById('transaction-list');
    const emptyState = document.getElementById('no-transactions');
    list.innerHTML = '';

    if(user.transactions.length === 0) {
        emptyState.classList.remove('hidden');
    } else {
        emptyState.classList.add('hidden');
        user.transactions.forEach(t => {
            let iconClass = 'fa-receipt';
            if(t.category === 'Food') iconClass = 'fa-utensils';
            else if(t.category === 'Transport') iconClass = 'fa-car';
            else if(t.category === 'Shopping') iconClass = 'fa-bag-shopping';
            else if(t.category === 'Income') iconClass = 'fa-wallet';

            const amountClass = t.type === 'income' ? 'inc' : 'exp';
            const sign = t.type === 'income' ? '+' : '-';

            const item = `
                <div class="transaction-item">
                    <div style="display:flex; align-items:center;">
                        <div class="t-icon"><i class="fa-solid ${iconClass}"></i></div>
                        <div class="t-details">
                            <div class="t-title">${t.desc}</div>
                            <div class="t-date">${t.date} • ${t.category}</div>
                        </div>
                    </div>
                    <div class="t-amount ${amountClass}">${sign}$${t.amount.toFixed(2)}</div>
                </div>
            `;
            list.innerHTML += item;
        });
    }
}

// --- CORE & ONBOARDING ---
function handleOnboarding(e) {
    e.preventDefault();
    const name = document.getElementById('user-name').value;
    const income = parseFloat(document.getElementById('user-income').value);
    const goal = document.getElementById('user-goal').value;

    const userData = {
        name: name,
        monthlyIncome: income,
        goal: goal,
        balance: income,
        transactions: [],
        joinedDate: new Date().toISOString()
    };

    localStorage.setItem(DB_KEY, JSON.stringify(userData));
    initializeApp(userData);
}

function initializeApp(user) {
    document.getElementById('onboarding-view').classList.remove('active');
    document.getElementById('main-header').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('active');
    document.getElementById('main-nav').classList.add('visible');

    document.getElementById('header-avatar').innerText = user.name.charAt(0).toUpperCase();
    document.getElementById('dashboard-greeting').innerText = `Hello, ${user.name}! 👋`;
    
    renderDashboard(user);
}

// --- HELPER FUNCTIONS ---
function toggleProfileMenu() { document.getElementById('profile-menu').classList.toggle('open'); }
function logout() { if(confirm("Reset profile?")) { localStorage.removeItem(DB_KEY); location.reload(); } }

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}
function loadTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.body.classList.add('dark-mode');
        updateThemeIcon(true);
    }
}
function updateThemeIcon(isDark) {
    document.getElementById('theme-btn').innerHTML = isDark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
}
function switchView(viewId, navElement) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId + '-view').classList.add('active');
    if(navElement) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navElement.classList.add('active');
    }
}
function handleEnter(e) { if (e.key === 'Enter') sendMessage(); }
function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';
    setTimeout(() => {
        const user = JSON.parse(localStorage.getItem(DB_KEY));
        addMessage(`Great work tracking your expenses, ${user.name}. You're making progress on your goal: ${user.goal}.`, 'bot');
    }, 1000);
}
function addMessage(text, sender) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = `message ${sender}`;
    div.innerText = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    // 1. Show User Message
    addMessage(text, 'user');
    input.value = '';

    // 2. Show "Typing..." indicator
    const loadingId = 'loading-' + Date.now();
    const container = document.getElementById('chat-messages');
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'message bot';
    loadingDiv.id = loadingId;
    loadingDiv.innerText = 'Thinking...';
    container.appendChild(loadingDiv);
    container.scrollTop = container.scrollHeight;

    try {
        // 3. Get User Data for Context
        // We send this to the backend so the AI knows who it's talking to
        const userContext = JSON.parse(localStorage.getItem(DB_KEY));

        // 4. Call the Backend
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                message: text,
                userContext: userContext 
            })
        });

        const data = await response.json();

        // 5. Remove Loading & Show AI Response
        document.getElementById(loadingId).remove();
        addMessage(data.reply, 'bot');

    } catch (error) {
        console.error("Error:", error);
        document.getElementById(loadingId).remove();
        addMessage("Sorry, I'm having trouble connecting. Check your internet or server.", 'bot');
    }
}

// --- GOAL UPDATE LOGIC ---

function toggleGoalModal() {
    const modal = document.getElementById('goal-modal');
    const menu = document.getElementById('profile-menu');
    
    // Close the profile menu first if it's open
    if(menu.classList.contains('open')) {
        menu.classList.remove('open');
    }

    // Toggle the modal
    modal.classList.toggle('open');
}

function handleGoalUpdate(e) {
    e.preventDefault();
    const newGoal = document.getElementById('update-goal-select').value;

    // 1. Get current data
    const userData = JSON.parse(localStorage.getItem(DB_KEY));

    // 2. Update the goal
    userData.goal = newGoal;

    // 3. Save back to storage
    localStorage.setItem(DB_KEY, JSON.stringify(userData));

    // 4. Notify User & Close
    alert(`Goal successfully updated to: ${newGoal}`);
    toggleGoalModal();

    // Optional: Add a system message to chat to confirm the change
    addMessage(`I've updated your goal to "${newGoal}". How can I help you achieve it?`, 'bot');
}

// --- VOICE INTERACTION LOGIC ---

function startDictation() {
    const micBtn = document.getElementById('mic-btn');
    const inputField = document.getElementById('chat-input');

    // 1. Check Browser Support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
        alert("Sorry, voice input isn't supported in this browser. Try Chrome or Edge!");
        return;
    }

    // 2. Initialize Recognition
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; // You can change this to 'hi-IN' for Hinglish support!
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    // 3. Handle Start
    recognition.start();
    micBtn.classList.add('listening'); // Turn button red/pulsing
    inputField.placeholder = "Listening...";

    // 4. Handle Result
    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript;
        inputField.value = speechResult;
        
        // Optional: Auto-send after speaking
        // sendMessage(); 
    };

    // 5. Handle End / Error
    recognition.onspeechend = () => {
        recognition.stop();
        micBtn.classList.remove('listening');
        inputField.placeholder = "Ask for advice...";
    };

    recognition.onerror = (event) => {
        console.error("Speech Error:", event.error);
        micBtn.classList.remove('listening');
        inputField.placeholder = "Error. Try again.";
    };
}