// App State
const AppState = {
    currentScreen: 'welcome',
    user: null,
    goals: [],
    chatHistory: [],
    currentTab: 'all',
    editingGoalId: null
};

// API Configuration
const API_URL = 'http://localhost:3000/api';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    attachEventListeners();
    checkExistingUser();
});

function initializeApp() {
    // Load data from localStorage
    const savedUser = localStorage.getItem('goalflow_user');
    const savedGoals = localStorage.getItem('goalflow_goals');

    if (savedUser) {
        AppState.user = JSON.parse(savedUser);
    }

    if (savedGoals) {
        AppState.goals = JSON.parse(savedGoals);
    }
}

function checkExistingUser() {
    if (AppState.user) {
        showScreen('choice');
        updateUserDisplay();
    }
}

function attachEventListeners() {
    // Welcome Screen
    document.getElementById('user-info-form').addEventListener('submit', handleUserSubmit);
    const welcomeLogo = document.getElementById('main-logo-welcome');
    if (welcomeLogo) {
        welcomeLogo.addEventListener('click', () => {
            if (AppState.user) showScreen('choice');
        });
    }

    // Logo Navigation
    document.querySelectorAll('.nav-logo').forEach(logo => {
        logo.addEventListener('click', () => {
            if (AppState.user) showScreen('choice');
        });
    });

    // Choice Screen
    document.querySelectorAll('[data-choice]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const choice = e.currentTarget.dataset.choice;
            handleChoice(choice);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Consultation Screen
    document.getElementById('back-to-choice-btn').addEventListener('click', () => showScreen('choice'));
    document.getElementById('chat-form').addEventListener('submit', handleChatSubmit);
    document.getElementById('generate-goals-btn').addEventListener('click', generateGoalsFromChat);

    // Goals Screen
    document.getElementById('add-goal-btn').addEventListener('click', () => openGoalModal());
    const aiSupportBtn = document.getElementById('ai-support-btn');
    if (aiSupportBtn) aiSupportBtn.addEventListener('click', openAISupportModal);

    document.getElementById('profile-btn').addEventListener('click', () => showScreen('profile'));
    document.getElementById('logout-goals-btn').addEventListener('click', handleLogout);

    // Tabs
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            const tabName = e.target.dataset.tab;
            switchTab(tabName);
        });
    });

    // Profile Screen
    document.getElementById('back-to-goals-btn').addEventListener('click', () => showScreen('goals'));
    document.getElementById('export-data-btn').addEventListener('click', exportUserData);
    document.getElementById('delete-account-btn').addEventListener('click', deleteAccount);

    // Modal
    document.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
        btn.addEventListener('click', closeGoalModal);
    });

    document.querySelectorAll('.close-ai-modal, .cancel-modal-ai').forEach(btn => {
        btn.addEventListener('click', closeAISupportModal);
    });

    document.getElementById('goal-modal').addEventListener('click', (e) => {
        if (e.target.id === 'goal-modal') {
            closeGoalModal();
        }
    });

    document.getElementById('ai-support-modal').addEventListener('click', (e) => {
        if (e.target.id === 'ai-support-modal') {
            closeAISupportModal();
        }
    });

    document.getElementById('goal-form').addEventListener('submit', handleGoalSubmit);
}

// Screen Management
function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });

    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
        targetScreen.classList.add('active');
        AppState.currentScreen = screenName;

        // Update screen-specific data
        if (screenName === 'goals') {
            renderGoals();
            startNotificationSystem(); // Khởi động kiểm tra thông báo
        } else if (screenName === 'profile') {
            updateProfileScreen();
        } else if (screenName === 'consultation') {
            initializeConsultation();
        }
    }
}

// Notification System (Mới thêm)
function startNotificationSystem() {
    // Xin quyền HTML5 Notification nếu chưa có
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }

    const activeGoals = AppState.goals.filter(g => g.status !== 'completed');
    if (activeGoals.length === 0) return;

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const currentMonthStr = todayStr.substring(0, 7);   // "YYYY-MM"

    // Lấy lịch sử thông báo từ localStorage
    const lastDailyNotif = localStorage.getItem('goalflow_last_daily_notif');
    const lastMonthlyNotif = localStorage.getItem('goalflow_last_monthly_notif');

    let hasShortTerm = false;
    let hasLongTerm = false;

    activeGoals.forEach(goal => {
        const deadline = new Date(goal.deadline);
        const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

        if (daysLeft >= 180) {
            hasLongTerm = true;
        } else {
            hasShortTerm = true;
        }
    });

    // 1. Thông báo tiến độ Hàng Ngày (Cho mục tiêu ngắn hạn < 6 tháng)
    if (hasShortTerm && lastDailyNotif !== todayStr) {
        setTimeout(() => {
            showToast('🔔 Nhắc nhở: Đừng quên thực hiện các mục tiêu ngắn hạn ngày hôm nay nhé!', 'info');
            sendBrowserNotification('Gợi ý từ GoalFlow', 'Đừng quên thực hiện các mục tiêu ngắn hạn ngày hôm nay nhé!');
            localStorage.setItem('goalflow_last_daily_notif', todayStr);
        }, 2000);
    }

    // 2. Thông báo tiến độ Hàng Tháng (Cho mục tiêu dài hạn >= 6 tháng)
    if (hasLongTerm && lastMonthlyNotif !== currentMonthStr) {
        setTimeout(() => {
            showToast('🌟 Tổng kết tháng: Hãy rà soát lại các mục tiêu dài hạn của bạn để đảm bảo đúng tiến độ!', 'success');
            sendBrowserNotification('Đánh giá hàng tháng', 'Hãy dành chút thời gian nhìn lại mục tiêu dài hạn của mình nào.');
            localStorage.setItem('goalflow_last_monthly_notif', currentMonthStr);
        }, hasShortTerm ? 5000 : 2000); // Tránh trùng lặp 2 toast cùng lúc
    }
}

function sendBrowserNotification(title, body) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification(title, {
            body: body,
            icon: '/favicon.ico' // Trỏ tới icon web tạm, có thể đổi lại
        });
    }
}

// User Management
async function handleUserSubmit(e) {
    e.preventDefault();

    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('user-email').value.trim();

    if (!name || !email) {
        showToast('Vui lòng điền đầy đủ thông tin', 'error');
        return;
    }

    if (!email.toLowerCase().endsWith('@gmail.com')) {
        showToast('Vui lòng nhập đúng định dạng @gmail.com', 'error');
        // Quét focus vào ô lỗi
        document.getElementById('user-email').focus();
        return;
    }

    AppState.user = {
        id: Date.now().toString(),
        name,
        email,
        createdAt: new Date().toISOString()
    };

    // Save to localStorage
    localStorage.setItem('goalflow_user', JSON.stringify(AppState.user));

    // Send to backend
    try {
        await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(AppState.user)
        });

        // TODO: Gửi email chào mừng bằng Nodemailer (Sẽ tích hợp ở bước sau trên Server)
    } catch (error) {
        console.error('Error saving user:', error);
    }

    updateUserDisplay();
    showScreen('choice');

    // Hiển thị 2 thông báo liên tiếp
    showToast(`Chào mừng ${name}!`, 'success');

    // Thông báo hành động sau 1 giây
    setTimeout(() => {
        showToast('👇 Vui lòng kéo xuống để vào giao diện lựa chọn', 'info');
    }, 1500);
}

function updateUserDisplay() {
    if (AppState.user) {
        document.getElementById('display-user-name').textContent = AppState.user.name;
        document.getElementById('profile-name').textContent = AppState.user.name;
        document.getElementById('profile-email').textContent = AppState.user.email;
    }
}

function handleLogout() {
    if (confirm('Bạn có chắc muốn đăng xuất? Dữ liệu sẽ được lưu trên thiết bị này.')) {
        showScreen('welcome');
        showToast('Đã đăng xuất thành công', 'success');
    }
}

function deleteAccount() {
    if (confirm('Bạn có chắc muốn xóa tài khoản? Hành động này không thể hoàn tác!')) {
        localStorage.removeItem('goalflow_user');
        localStorage.removeItem('goalflow_goals');
        AppState.user = null;
        AppState.goals = [];
        showScreen('welcome');
        showToast('Đã xóa tài khoản thành công', 'success');
    }
}

// Choice Handling
function handleChoice(choice) {
    if (choice === 'has-goals') {
        showScreen('goals');
    } else if (choice === 'no-goals') {
        showScreen('consultation');
    }
}

// AI Consultation
function initializeConsultation() {
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = `
        <div class="chat-message ai-message">
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <p>Xin chào ${AppState.user.name}! Tôi là trợ lý AI của GoalFlow. Tôi sẽ giúp bạn xác định và xây dựng các mục tiêu phù hợp.</p>
                <p>Để bắt đầu, hãy cho tôi biết: <strong>Bạn muốn đạt được điều gì trong cuộc sống?</strong> (Có thể là sự nghiệp, sức khỏe, tài chính, học tập, hoặc bất kỳ lĩnh vực nào bạn quan tâm)</p>
            </div>
        </div>
    `;
    AppState.chatHistory = [];
    const container = document.getElementById('generate-goals-container');
    if (container) container.style.display = 'none';
}

async function handleChatSubmit(e) {
    e.preventDefault();

    const input = document.getElementById('chat-input');
    const message = input.value.trim();

    if (!message) return;

    // Add user message to chat
    addMessageToChat('user', message);
    AppState.chatHistory.push({ role: 'user', content: message });

    input.value = '';

    // Show typing indicator
    const typingId = addTypingIndicator();

    // Call AI API
    try {
        const response = await fetch(`${API_URL}/ai/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: AppState.user.id,
                message: message,
                history: AppState.chatHistory
            })
        });

        const data = await response.json();

        // Remove typing indicator
        removeTypingIndicator(typingId);

        if (data.success) {
            addMessageToChat('ai', data.response);
            AppState.chatHistory.push({ role: 'assistant', content: data.response });

            // Show generate button after sufficient conversation
            if (AppState.chatHistory.length >= 6) {
                const container = document.getElementById('generate-goals-container');
                if (container) container.style.display = 'block';
            }
        } else {
            addMessageToChat('ai', 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.');
        }
    } catch (error) {
        console.error('Error calling AI:', error);
        removeTypingIndicator(typingId);
        addMessageToChat('ai', 'Không thể kết nối với AI. Vui lòng kiểm tra kết nối mạng và thử lại.');
    }
}

function addMessageToChat(role, content) {
    const chatContainer = document.getElementById('chat-container');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role === 'user' ? 'user-message' : 'ai-message'}`;

    messageDiv.innerHTML = `
        <div class="message-avatar">${role === 'user' ? AppState.user.name.charAt(0).toUpperCase() : 'AI'}</div>
        <div class="message-content">
            <p>${content.replace(/\n/g, '<br>')}</p>
        </div>
    `;

    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addTypingIndicator() {
    const chatContainer = document.getElementById('chat-container');
    const typingDiv = document.createElement('div');
    const id = 'typing-' + Date.now();
    typingDiv.id = id;
    typingDiv.className = 'chat-message ai-message';

    typingDiv.innerHTML = `
        <div class="message-avatar">AI</div>
        <div class="message-content">
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;

    chatContainer.appendChild(typingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    return id;
}

function removeTypingIndicator(id) {
    const element = document.getElementById(id);
    if (element) {
        element.remove();
    }
}

async function generateGoalsFromChat() {
    const btn = document.getElementById('generate-goals-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<div class="loading"></div><span>Đang tạo mục tiêu...</span>';

    const timeframeValue = document.getElementById('timeframe-value').value;
    const timeframeUnit = document.getElementById('timeframe-unit').value;
    const timeframeStr = `${timeframeValue} ${timeframeUnit}`;

    try {
        const response = await fetch(`${API_URL}/ai/generate-goals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: AppState.user.id,
                chatHistory: AppState.chatHistory,
                timeframe: timeframeStr
            })
        });

        const data = await response.json();

        if (data.success && data.goals) {
            // Add generated goals to state
            data.goals.forEach(goal => {
                AppState.goals.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    ...goal,
                    status: 'in-progress',
                    createdAt: new Date().toISOString()
                });
            });

            saveGoals();
            showScreen('goals');
            showToast(`Đã tạo ${data.goals.length} mục tiêu thành công!`, 'success');
        } else {
            showToast('Không thể tạo mục tiêu. Vui lòng thử lại.', 'error');
        }
    } catch (error) {
        console.error('Error generating goals:', error);
        showToast('Đã có lỗi xảy ra. Vui lòng thử lại.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// Goals Management
// Track intervals để clear khi render lại
let countdownIntervals = [];

function renderGoals() {
    const goalsList = document.getElementById('goals-list');
    const filteredGoals = filterGoalsByTab(AppState.currentTab);

    // Clear old intervals
    countdownIntervals.forEach(interval => clearInterval(interval));
    countdownIntervals = [];

    if (filteredGoals.length === 0) {
        goalsList.innerHTML = `
            <div class="empty-state">
                <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
                    <circle cx="40" cy="40" r="30" stroke="currentColor" stroke-width="3" opacity="0.3"/>
                    <path d="M40 30v20M30 40h20" stroke="currentColor" stroke-width="3" stroke-linecap="round" opacity="0.3"/>
                </svg>
                <p>Chưa có mục tiêu nào</p>
                <p class="empty-subtitle">Nhấn "Thêm mục tiêu" để bắt đầu</p>
            </div>
        `;
        return;
    }

    goalsList.innerHTML = filteredGoals.map(goal => createGoalCard(goal)).join('');

    // Attach event listeners to goal actions
    attachGoalActionListeners();

    // Start countdown timers
    startCountdownTimers();
}

function startCountdownTimers() {
    const timers = document.querySelectorAll('.countdown-timer');

    timers.forEach(timerEl => {
        const deadlineStr = timerEl.dataset.deadline;
        // Đặt deadline vào 23:59:59 của ngày mục tiêu
        const deadline = new Date(deadlineStr);
        deadline.setHours(23, 59, 59, 999);

        const daysEl = timerEl.querySelector('.days');
        const hoursEl = timerEl.querySelector('.hours');
        const minutesEl = timerEl.querySelector('.minutes');
        const secondsEl = timerEl.querySelector('.seconds');

        const updateTimer = () => {
            const now = new Date();
            const timeDifference = deadline - now;

            if (timeDifference <= 0) {
                daysEl.textContent = '00';
                hoursEl.textContent = '00';
                minutesEl.textContent = '00';
                secondsEl.textContent = '00';
                timerEl.style.borderColor = 'var(--danger-color)';
                timerEl.style.opacity = '0.7';
                return;
            }

            const days = Math.floor(timeDifference / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeDifference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeDifference % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeDifference % (1000 * 60)) / 1000);

            daysEl.textContent = days.toString().padStart(2, '0');
            hoursEl.textContent = hours.toString().padStart(2, '0');
            minutesEl.textContent = minutes.toString().padStart(2, '0');
            secondsEl.textContent = seconds.toString().padStart(2, '0');

            // Đổi màu nếu sắp hết hạn (dưới 3 ngày)
            if (days < 3) {
                timerEl.style.borderColor = 'var(--warning-color)';
            }
        };

        // Cập nhật ngay lần đầu tiên
        updateTimer();

        // Cập nhật mỗi giây
        const intervalId = setInterval(updateTimer, 1000);
        countdownIntervals.push(intervalId);
    });
}

function createGoalCard(goal) {
    const categoryLabels = {
        'weekly': 'Tuần',
        'monthly': 'Tháng',
        'yearly': 'Năm',
        'long-term': 'Dài hạn'
    };

    const priorityLabels = {
        'high': 'Cao',
        'medium': 'Trung bình',
        'low': 'Thấp'
    };

    const deadline = new Date(goal.deadline);
    const today = new Date();
    const daysLeft = Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));

    const isCompleted = goal.status === 'completed';

    return `
        <div class="goal-item" data-goal-id="${goal.id}">
            <div class="goal-header-row">
                <div class="goal-title-section">
                    <h3>${goal.title}</h3>
                    <div class="goal-meta">
                        <span class="goal-badge badge-category">${categoryLabels[goal.category]}</span>
                        <span class="goal-badge badge-priority-${goal.priority}">${priorityLabels[goal.priority]}</span>
                    </div>
                </div>
            </div>
            
            ${isCompleted ? `
            <div class="goal-completed-text">Mục tiêu đã hoàn thành</div>
            ` : `
            <div class="countdown-timer" data-deadline="${goal.deadline}">
                <div class="timer-box">
                    <span class="time-val days">00</span>
                    <span class="time-label">Ngày</span>
                </div>
                <div class="timer-sep">:</div>
                <div class="timer-box">
                    <span class="time-val hours">00</span>
                    <span class="time-label">Giờ</span>
                </div>
                <div class="timer-sep">:</div>
                <div class="timer-box">
                    <span class="time-val minutes">00</span>
                    <span class="time-label">Phút</span>
                </div>
                <div class="timer-sep">:</div>
                <div class="timer-box">
                    <span class="time-val seconds">00</span>
                    <span class="time-label">Giây</span>
                </div>
            </div>
            `}
            
            ${goal.description ? `<p class="goal-description">${goal.description}</p>` : ''}
            <div class="goal-actions">
                ${!isCompleted ? `
                <button class="btn btn-outline btn-complete" data-goal-id="${goal.id}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8l4 4 6-8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                    <span>Hoàn thành</span>
                </button>
                ` : ''}
                <button class="btn btn-outline btn-edit" data-goal-id="${goal.id}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M11 2l3 3-8 8H3v-3l8-8z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>Sửa</span>
                </button>
                <button class="btn btn-outline btn-delete" data-goal-id="${goal.id}">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M2 4h12M6 4V3a1 1 0 011-1h2a1 1 0 011 1v1M4 4v9a1 1 0 001 1h6a1 1 0 001-1V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                    <span>Xóa</span>
                </button>
            </div>
        </div>
    `;
}

function attachGoalActionListeners() {
    // Complete buttons
    document.querySelectorAll('.btn-complete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            completeGoal(goalId);
        });
    });

    // Edit buttons
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            openGoalModal(goalId);
        });
    });

    // Delete buttons
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const goalId = e.currentTarget.dataset.goalId;
            deleteGoal(goalId);
        });
    });
}

function filterGoalsByTab(tab) {
    if (tab === 'all') {
        return AppState.goals;
    }
    return AppState.goals.filter(goal => goal.category === tab);
}

function switchTab(tabName) {
    AppState.currentTab = tabName;

    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    renderGoals();
}

// Goal Modal
function openGoalModal(goalId = null) {
    const modal = document.getElementById('goal-modal');
    const form = document.getElementById('goal-form');
    const modalTitle = document.getElementById('modal-title');
    const submitText = document.getElementById('submit-text');

    form.reset();

    if (goalId) {
        // Edit mode
        AppState.editingGoalId = goalId;
        const goal = AppState.goals.find(g => g.id === goalId);

        if (goal) {
            modalTitle.textContent = 'Chỉnh sửa mục tiêu';
            submitText.textContent = 'Cập nhật';

            document.getElementById('goal-title').value = goal.title;
            document.getElementById('goal-description').value = goal.description || '';
            document.getElementById('goal-category').value = goal.category;
            document.getElementById('goal-deadline').value = goal.deadline;
            document.getElementById('goal-priority').value = goal.priority;
        }
    } else {
        // Add mode
        AppState.editingGoalId = null;
        modalTitle.textContent = 'Thêm mục tiêu mới';
        submitText.textContent = 'Thêm mục tiêu';

        // Set default deadline to next week
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        document.getElementById('goal-deadline').value = nextWeek.toISOString().split('T')[0];
    }

    modal.classList.add('active');
}

function closeGoalModal() {
    const modal = document.getElementById('goal-modal');
    modal.classList.remove('active');
    AppState.editingGoalId = null;
}

async function handleGoalSubmit(e) {
    e.preventDefault();

    const goalData = {
        title: document.getElementById('goal-title').value.trim(),
        description: document.getElementById('goal-description').value.trim(),
        category: document.getElementById('goal-category').value,
        deadline: document.getElementById('goal-deadline').value,
        priority: document.getElementById('goal-priority').value,
    };

    if (AppState.editingGoalId) {
        // Update existing goal
        const goalIndex = AppState.goals.findIndex(g => g.id === AppState.editingGoalId);
        if (goalIndex !== -1) {
            AppState.goals[goalIndex] = {
                ...AppState.goals[goalIndex],
                ...goalData,
                updatedAt: new Date().toISOString()
            };
            showToast('Đã cập nhật mục tiêu', 'success');
        }
    } else {
        // Add new goal
        const newGoal = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            ...goalData,
            status: 'in-progress',
            createdAt: new Date().toISOString()
        };

        AppState.goals.push(newGoal);
        showToast('Đã thêm mục tiêu mới', 'success');
    }

    saveGoals();
    renderGoals();
    closeGoalModal();
}

// AI Support Modal Logic
function openAISupportModal() {
    const modal = document.getElementById('ai-support-modal');
    const goalsList = document.getElementById('ai-support-goals-list');

    const activeGoals = AppState.goals.filter(g => g.status !== 'completed');

    if (activeGoals.length === 0) {
        goalsList.innerHTML = '<p style="text-align:center; color: var(--text-secondary); padding: 20px;">Bạn chưa có mục tiêu nào đang thực hiện để AI hỗ trợ.</p>';
    } else {
        goalsList.innerHTML = activeGoals.map(goal => `
            <div class="ai-support-goal-item" data-goal-id="${goal.id}">
                <h4>${goal.title}</h4>
                ${goal.description ? `<p>${goal.description.substring(0, 50)}${goal.description.length > 50 ? '...' : ''}</p>` : ''}
            </div>
        `).join('');

        goalsList.querySelectorAll('.ai-support-goal-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const goalId = e.currentTarget.dataset.goalId;
                startAISupportForGoal(goalId);
            });
        });
    }

    modal.classList.add('active');
}

function closeAISupportModal() {
    document.getElementById('ai-support-modal').classList.remove('active');
}

function startAISupportForGoal(goalId) {
    closeAISupportModal();
    const goal = AppState.goals.find(g => g.id === goalId);
    if (!goal) return;

    // Setup consultation screen for specific goal support
    const chatContainer = document.getElementById('chat-container');
    chatContainer.innerHTML = `
        <div class="chat-message ai-message">
            <div class="message-avatar">AI</div>
            <div class="message-content">
                <p>Tôi thấy bạn đang cần hỗ trợ cho mục tiêu: <strong>"${goal.title}"</strong>.</p>
                ${goal.description ? `<p>Mô tả của bạn: "${goal.description}"</p>` : ''}
                <p>Bạn đang gặp khó khăn gì, hoặc bạn muốn tôi lập kế hoạch chi tiết như thế nào cho mục tiêu này?</p>
            </div>
        </div>
    `;

    // Initialize chat history with context
    AppState.chatHistory = [
        {
            role: 'assistant',
            content: `Tôi sẽ hỗ trợ bạn với mục tiêu: "${goal.title}". Bạn gặp vấn đề gì?`
        }
    ];

    // Hide the generate goals button container because we are supporting an existing goal
    const container = document.getElementById('generate-goals-container');
    if (container) container.style.display = 'none';

    showScreen('consultation');
}

function completeGoal(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (goal) {
        if (confirm(`Bạn đã hoàn thành mục tiêu "${goal.title}"?`)) {
            const goalIndex = AppState.goals.findIndex(g => g.id === goalId);
            AppState.goals[goalIndex].status = 'completed';
            AppState.goals[goalIndex].completedAt = new Date().toISOString();

            saveGoals();
            renderGoals();
            showToast('Chúc mừng! Bạn đã hoàn thành mục tiêu', 'success');

            // Send notification email
            sendCompletionNotification(goal);
        }
    }
}

function deleteGoal(goalId) {
    const goal = AppState.goals.find(g => g.id === goalId);
    if (goal) {
        if (confirm(`Bạn có chắc muốn xóa mục tiêu "${goal.title}"?`)) {
            AppState.goals = AppState.goals.filter(g => g.id !== goalId);
            saveGoals();
            renderGoals();
            showToast('Đã xóa mục tiêu', 'success');
        }
    }
}

function saveGoals() {
    localStorage.setItem('goalflow_goals', JSON.stringify(AppState.goals));

    // Sync with backend
    try {
        fetch(`${API_URL}/goals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: AppState.user.id,
                goals: AppState.goals
            })
        });
    } catch (error) {
        console.error('Error syncing goals:', error);
    }
}

async function sendCompletionNotification(goal) {
    try {
        await fetch(`${API_URL}/notifications/completion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId: AppState.user.id,
                email: AppState.user.email,
                goalTitle: goal.title
            })
        });
    } catch (error) {
        console.error('Error sending notification:', error);
    }
}

// Profile Screen
function updateProfileScreen() {
    const totalGoals = AppState.goals.length;
    const completedGoals = AppState.goals.filter(g => g.status === 'completed').length;
    const inProgressGoals = AppState.goals.filter(g => g.status === 'in-progress').length;

    document.getElementById('total-goals').textContent = totalGoals;
    document.getElementById('completed-goals').textContent = completedGoals;
    document.getElementById('in-progress-goals').textContent = inProgressGoals;

    drawPriorityChart();
}

function drawPriorityChart() {
    const canvas = document.getElementById('priority-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(cx, cy) - 10;

    let high = 0, medium = 0, low = 0;
    AppState.goals.forEach(g => {
        if (g.priority === 'high') high++;
        else if (g.priority === 'medium') medium++;
        else low++;
    });

    const total = high + medium + low;
    ctx.clearRect(0, 0, w, h);

    if (total === 0) {
        ctx.fillStyle = '#E2E8F0';
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#718096';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '14px "Space Mono"';
        ctx.fillText('Chưa có', cx, cy - 10);
        ctx.fillText('mục tiêu', cx, cy + 10);

        document.getElementById('priority-legend').innerHTML = '<p style="color: var(--text-secondary); font-size: 0.875rem;">Chưa có dữ liệu mục tiêu để hiển thị biểu đồ.</p>';
        return;
    }

    const data = [
        { label: 'Cao', value: high, color: '#F56565' },
        { label: 'Trung bình', value: medium, color: '#ECC94B' },
        { label: 'Thấp', value: low, color: '#48BB78' }
    ];

    let startAngle = -Math.PI / 2;
    let legendHTML = '';

    data.forEach(item => {
        if (item.value === 0) return;
        const sliceAngle = (item.value / total) * 2 * Math.PI;
        const percent = Math.round((item.value / total) * 100);

        ctx.fillStyle = item.color;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fill();

        startAngle += sliceAngle;

        legendHTML += `
            <div style="display: flex; align-items: center; gap: 8px; font-size: 0.875rem;">
                <div style="width: 16px; height: 16px; border-radius: 4px; background: ${item.color};"></div>
                <span style="font-weight: 600;">${item.label}</span>
                <span style="color: var(--text-secondary);">(${percent}%) - ${item.value} mục tiêu</span>
            </div>
        `;
    });

    document.getElementById('priority-legend').innerHTML = legendHTML;
}

function exportUserData() {
    if (!AppState.goals || AppState.goals.length === 0) {
        showToast('Không có dữ liệu mục tiêu để xuất', 'info');
        return;
    }

    // Prepare data for Excel
    const excelData = AppState.goals.map(goal => ({
        "Tiêu đề": goal.title,
        "Mô tả": goal.description || '',
        "Danh mục": goal.category === 'weekly' ? 'Tuần' : goal.category === 'monthly' ? 'Tháng' : goal.category === 'yearly' ? 'Năm' : 'Dài hạn',
        "Độ ưu tiên": goal.priority === 'high' ? 'Cao' : goal.priority === 'medium' ? 'Trung bình' : 'Thấp',
        "Hạn hoàn thành": goal.deadline,
        "Trạng thái": goal.status === 'completed' ? 'Đã hoàn thành' : 'Đang thực hiện',
        "Ngày tạo": new Date(goal.createdAt).toLocaleDateString('vi-VN'),
        "Ngày hoàn thành": goal.completedAt ? new Date(goal.completedAt).toLocaleDateString('vi-VN') : ''
    }));

    try {
        // Create a new workbook
        const wb = XLSX.utils.book_new();

        // Convert JSON to worksheet
        const ws = XLSX.utils.json_to_sheet(excelData);

        // Auto-size columns (basic implementation)
        const colWidths = [
            { wch: 30 }, // Tiêu đề
            { wch: 40 }, // Mô tả
            { wch: 15 }, // Danh mục
            { wch: 15 }, // Độ ưu tiên
            { wch: 15 }, // Hạn hoàn thành
            { wch: 20 }, // Trạng thái
            { wch: 15 }, // Ngày tạo
            { wch: 15 }  // Ngày hoàn thành
        ];
        ws['!cols'] = colWidths;

        // Add worksheet to workbook
        XLSX.utils.book_append_sheet(wb, ws, "Mục Tiêu");

        // Use SheetJS to write and download file
        const fileName = `GoalFlow_Data_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);

        showToast('Đã xuất dữ liệu Excel thành công', 'success');
    } catch (error) {
        console.error('Lỗi khi xuất định dạng Excel:', error);
        showToast('Có lỗi xảy ra khi xuất dữ liệu', 'error');
    }
}

// Toast Notifications
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            document.body.removeChild(toast);
        }, 300);
    }, 3000);
}
