// ===== API CONFIG =====
const API_URL = 'http://localhost:3000/api';

// ===== API HELPER =====
const api = {
    token: localStorage.getItem('urp_token'),
    
    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(this.token && { 'Authorization': `Bearer ${this.token}` })
        };
        
        try {
            const response = await fetch(`${API_URL}${endpoint}`, {
                ...options,
                headers: { ...headers, ...options.headers }
            });
            
            // Check if response is JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                if (!response.ok) {
                    throw new Error(`Ошибка сервера: ${response.status}`);
                }
                throw new Error('Сервер вернул некорректный ответ');
            }
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Ошибка запроса');
            }
            
            return data;
        } catch (error) {
            if (error.message === 'Failed to fetch') {
                throw new Error('Сервер недоступен');
            }
            throw error;
        }
    },
    
    get(endpoint) {
        return this.request(endpoint);
    },
    
    post(endpoint, data) {
        return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) });
    },
    
    put(endpoint, data) {
        return this.request(endpoint, { method: 'PUT', body: JSON.stringify(data) });
    },
    
    delete(endpoint) {
        return this.request(endpoint, { method: 'DELETE' });
    },
    
    async uploadFile(endpoint, file, fieldName = 'file') {
        const formData = new FormData();
        formData.append(fieldName, file);
        
        const response = await fetch(`${API_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                ...(this.token && { 'Authorization': `Bearer ${this.token}` })
            },
            body: formData
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Ошибка загрузки');
        }
        return data;
    },
    
    setToken(token) {
        this.token = token;
        if (token) {
            localStorage.setItem('urp_token', token);
        } else {
            localStorage.removeItem('urp_token');
        }
    }
};

// ===== STATE =====
let currentUser = null;
let currentCategory = 'all';
let selectedPostCategory = null;
let currentPostId = null;
let currentPage = 1;
let postsPerPage = 10;
let searchQuery = '';
let unreadNotifications = 0;
let unreadMessages = 0;

// ===== EMAIL VALIDATION =====
const commonEmailDomains = [
    'gmail.com', 'mail.ru', 'yandex.ru', 'yahoo.com', 'outlook.com', 
    'hotmail.com', 'icloud.com', 'rambler.ru', 'bk.ru', 'list.ru',
    'inbox.ru', 'ya.ru', 'yandex.com', 'protonmail.com', 'live.com'
];

const commonTypos = {
    'gmial.com': 'gmail.com',
    'gmal.com': 'gmail.com',
    'gmali.com': 'gmail.com',
    'gmail.co': 'gmail.com',
    'gmail.cm': 'gmail.com',
    'gmail.om': 'gmail.com',
    'gmail.con': 'gmail.com',
    'gmail.coom': 'gmail.com',
    'gmailc.om': 'gmail.com',
    'gmaill.com': 'gmail.com',
    'gamil.com': 'gmail.com',
    'gnail.com': 'gmail.com',
    'mail.r': 'mail.ru',
    'mail.ri': 'mail.ru',
    'mail.rru': 'mail.ru',
    'mai.ru': 'mail.ru',
    'maill.ru': 'mail.ru',
    'yandex.r': 'yandex.ru',
    'yandex.ri': 'yandex.ru',
    'yandex.rru': 'yandex.ru',
    'yanex.ru': 'yandex.ru',
    'yndex.ru': 'yandex.ru',
    'yahoo.co': 'yahoo.com',
    'yahoo.cm': 'yahoo.com',
    'yahooo.com': 'yahoo.com',
    'outlok.com': 'outlook.com',
    'outloo.com': 'outlook.com',
    'hotmal.com': 'hotmail.com',
    'hotmai.com': 'hotmail.com',
    'hotmial.com': 'hotmail.com'
};

function validateEmail(email) {
    const result = { valid: true, suggestion: null, error: null };
    
    // Basic format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        result.valid = false;
        result.error = 'Неверный формат email';
        return result;
    }
    
    const [localPart, domain] = email.toLowerCase().split('@');
    
    // Check for common typos
    if (commonTypos[domain]) {
        result.valid = false;
        result.suggestion = `${localPart}@${commonTypos[domain]}`;
        result.error = `Возможно вы имели в виду: ${result.suggestion}?`;
        return result;
    }
    
    // Check for similar domains (Levenshtein distance)
    for (const correctDomain of commonEmailDomains) {
        if (domain !== correctDomain && levenshteinDistance(domain, correctDomain) <= 2) {
            result.suggestion = `${localPart}@${correctDomain}`;
            result.error = `Возможно вы имели в виду: ${result.suggestion}?`;
            // Don't mark as invalid, just suggest
            break;
        }
    }
    
    return result;
}

function levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (str1[i - 1] === str2[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
            }
        }
    }
    return dp[m][n];
}

// ===== CONSTANTS =====
const categoryMap = {
    complaint: 'complaints',
    appeal: 'appeals',
    question: 'questions',
    suggestion: 'suggestions'
};

const categoryNames = {
    all: 'Все темы',
    complaints: 'Жалобы',
    appeals: 'Апелляции',
    questions: 'Вопросы',
    suggestions: 'Предложения'
};

const categoryFormNames = {
    complaint: 'Жалоба на игрока',
    appeal: 'Апелляция бана',
    question: 'Вопрос',
    suggestion: 'Предложение'
};

const avatars = ['🎮', '🎯', '⚡', '🔥', '💡', '🚀', '🎪', '🎨', '🎭', '🎸', '🎹', '🎺', '🌟', '💎', '🦊', '🐺', '🦁', '🐯', '🎲', '🏆', '👑', '🎖️', '🛡️', '⚔️'];

// ===== DOM ELEMENTS =====
const toastContainer = document.getElementById('toastContainer');
const postsList = document.getElementById('postsList');
const postsTitle = document.getElementById('postsTitle');
const postsCount = document.getElementById('postsCount');
const emptyState = document.getElementById('emptyState');
const loadMoreBtn = document.getElementById('loadMoreBtn');

// ===== TOAST NOTIFICATIONS =====
function showToast(type, title, message) {
    const icons = {
        success: 'check',
        error: 'times',
        info: 'info',
        warning: 'exclamation-triangle'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            <i class="fas fa-${icons[type] || 'info'}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;
    toastContainer.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

// ===== HELPER: RENDER AVATAR =====
function renderAvatar(user, size = '') {
    if (user.avatar_url) {
        return `<img src="${user.avatar_url}" alt="Avatar" class="user-avatar-img">`;
    }
    return user.avatar || '🎮';
}

// ===== HELPER: RENDER ROLE BADGE =====
function renderRoleBadge(role, roleInfo) {
    if (!roleInfo) return '';
    return `<span class="profile-role-badge role-${role}"><i class="fas ${roleInfo.icon}"></i> ${roleInfo.name}</span>`;
}

// ===== AUTHENTICATION =====
function openAuthModal(form = 'login') {
    document.getElementById('authModal').classList.add('active');
    switchAuthForm(form);
    document.body.style.overflow = 'hidden';
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('active');
    document.body.style.overflow = '';
    ['loginUsername', 'loginPassword', 'regUsername', 'regEmail', 'regRoblox', 'regPassword', 'regPasswordConfirm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

function switchAuthForm(form) {
    document.getElementById('loginForm').classList.toggle('hidden', form !== 'login');
    document.getElementById('registerForm').classList.toggle('hidden', form !== 'register');
}

function togglePassword(inputId, btn) {
    const input = document.getElementById(inputId);
    const icon = btn.querySelector('i');
    
    if (input.type === 'password') {
        input.type = 'text';
        icon.classList.replace('fa-eye', 'fa-eye-slash');
    } else {
        input.type = 'password';
        icon.classList.replace('fa-eye-slash', 'fa-eye');
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    if (!username || !password) {
        showToast('error', 'Ошибка', 'Заполните все поля');
        return;
    }
    
    try {
        const response = await api.post('/auth/login', { username, password });
        api.setToken(response.token);
        currentUser = response.user;
        localStorage.setItem('urp_user', JSON.stringify(currentUser));
        
        closeAuthModal();
        updateAuthUI();
        showToast('success', 'Добро пожаловать!', `Вы вошли как ${currentUser.username}`);
        loadNotificationsCount();
        loadMessagesCount();
    } catch (error) {
        showToast('error', 'Ошибка входа', error.message);
    }
}

async function handleRegister(e) {
    e.preventDefault();
    
    const username = document.getElementById('regUsername').value.trim();
    let email = document.getElementById('regEmail').value.trim().toLowerCase();
    const robloxNick = document.getElementById('regRoblox').value.trim();
    const password = document.getElementById('regPassword').value;
    const passwordConfirm = document.getElementById('regPasswordConfirm').value;
    const agreeTerms = document.getElementById('agreeTerms').checked;
    
    if (!username || !email || !robloxNick || !password) {
        showToast('error', 'Ошибка', 'Заполните все обязательные поля');
        return;
    }
    
    // Validate email
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
        if (emailValidation.suggestion) {
            const useSuggestion = confirm(`${emailValidation.error}\n\nИспользовать исправленный адрес?`);
            if (useSuggestion) {
                email = emailValidation.suggestion;
                document.getElementById('regEmail').value = email;
            } else {
        return;
    }
        } else {
            showToast('error', 'Ошибка email', emailValidation.error);
        return;
    }
    } else if (emailValidation.suggestion) {
        const useSuggestion = confirm(`${emailValidation.error}\n\nИспользовать исправленный адрес?`);
        if (useSuggestion) {
            email = emailValidation.suggestion;
            document.getElementById('regEmail').value = email;
        }
    }
    
    if (password !== passwordConfirm) {
        showToast('error', 'Ошибка', 'Пароли не совпадают');
        return;
    }
    
    if (!agreeTerms) {
        showToast('error', 'Ошибка', 'Необходимо согласиться с правилами');
        return;
    }
    
    try {
        const response = await api.post('/auth/register', { username, email, password, robloxNick });
        api.setToken(response.token);
        currentUser = response.user;
        localStorage.setItem('urp_user', JSON.stringify(currentUser));
    
    closeAuthModal();
    updateAuthUI();
    updateStats();
    
        if (response.emailSent) {
            showToast('success', 'Код отправлен!', 'Проверьте почту для подтверждения');
        }
        
        showWelcomeModal(currentUser);
    } catch (error) {
        showToast('error', 'Ошибка регистрации', error.message);
    }
}

function checkPasswordStrength(password) {
    const strengthEl = document.getElementById('passwordStrength');
    if (!strengthEl) return;
    
    let strength = 0;
    let text = '';
    let className = '';
    
    if (password.length >= 6) strength++;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    
    if (password.length === 0) {
        strengthEl.innerHTML = '';
        return;
    }
    
    if (strength <= 2) {
        className = 'weak';
        text = 'Слабый пароль';
    } else if (strength <= 3) {
        className = 'medium';
        text = 'Средний пароль';
    } else {
        className = 'strong';
        text = 'Надёжный пароль';
    }
    
    strengthEl.innerHTML = `
        <div class="strength-bar ${className}"></div>
        <div class="strength-text">${text}</div>
    `;
}

function checkPasswordMatch() {
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regPasswordConfirm').value;
    const matchEl = document.getElementById('passwordMatch');
    
    if (!matchEl || !confirm) {
        if (matchEl) matchEl.innerHTML = '';
        return;
    }
    
    if (password === confirm) {
        matchEl.innerHTML = '<i class="fas fa-check"></i> Пароли совпадают';
        matchEl.className = 'password-match match';
    } else {
        matchEl.innerHTML = '<i class="fas fa-times"></i> Пароли не совпадают';
        matchEl.className = 'password-match no-match';
    }
}

function showWelcomeModal(user) {
    document.getElementById('welcomeName').textContent = user.username;
    document.getElementById('welcomeEmail').textContent = user.email;
    document.getElementById('welcomeModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeWelcomeModal() {
    document.getElementById('welcomeModal').classList.remove('active');
    document.body.style.overflow = '';
    showToast('success', 'Готово!', 'Теперь вы можете создавать темы и комментировать');
}

async function logout() {
    try {
        await api.post('/auth/logout');
    } catch (error) {}
    
    api.setToken(null);
    currentUser = null;
    localStorage.removeItem('urp_user');
    updateAuthUI();
    closeUserMenu();
    goHome();
    showToast('info', 'До свидания!', 'Вы вышли из аккаунта');
}

function updateAuthUI() {
    const guestButtons = document.getElementById('guestButtons');
    const userButtons = document.getElementById('userButtons');
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const adminMenuItems = document.getElementById('adminMenuItems');
    
    if (currentUser) {
        guestButtons.classList.add('hidden');
        userButtons.classList.remove('hidden');
        userName.textContent = currentUser.username;
        
        if (currentUser.avatar_url) {
            userAvatar.innerHTML = `<img src="${currentUser.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">`;
        } else {
        userAvatar.textContent = currentUser.avatar;
        }
        
        // Show admin menu for staff (helper+)
        const roleLevel = currentUser.roleInfo?.level || 0;
        if (roleLevel >= 1) {
            adminMenuItems.classList.remove('hidden');
        } else {
            adminMenuItems.classList.add('hidden');
        }
    } else {
        guestButtons.classList.remove('hidden');
        userButtons.classList.add('hidden');
        adminMenuItems?.classList.add('hidden');
    }
    
    updateOnlineUsers();
}

// ===== USER MENU =====
function toggleUserMenu() {
    document.getElementById('userDropdown').classList.toggle('active');
}

function closeUserMenu() {
    document.getElementById('userDropdown').classList.remove('active');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.user-menu')) closeUserMenu();
});

// ===== EMAIL VERIFICATION =====
async function openEmailVerifyModal() {
    document.getElementById('emailVerifyModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('emailVerifyCode').value = '';
    
    // Load the verification code
    try {
        const data = await api.get('/auth/email-code');
        document.getElementById('emailVerifyAddress').textContent = data.email;
        document.getElementById('emailDisplayCode').textContent = data.code;
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function closeEmailVerifyModal() {
    document.getElementById('emailVerifyModal').classList.remove('active');
    document.body.style.overflow = '';
}

async function verifyEmail() {
    const code = document.getElementById('emailVerifyCode').value.trim();
    if (!code) {
        showToast('error', 'Ошибка', 'Введите код');
        return;
    }
    
    try {
        await api.post('/auth/verify-email', { code });
        closeEmailVerifyModal();
        currentUser.is_email_verified = 1;
        localStorage.setItem('urp_user', JSON.stringify(currentUser));
        showToast('success', 'Успешно!', 'Email подтверждён');
        
        if (!document.getElementById('profileSection').classList.contains('hidden')) {
            openProfile();
        }
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function refreshEmailCode() {
    try {
        const data = await api.post('/auth/resend-email-code');
        document.getElementById('emailDisplayCode').textContent = data.code;
        showToast('success', 'Готово', 'Новый код сгенерирован');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== ROBLOX VERIFICATION =====
function openRobloxVerifyModal() {
    document.getElementById('robloxVerifyModal').classList.add('active');
    document.getElementById('robloxVerifyStep1').classList.remove('hidden');
    document.getElementById('robloxVerifyStep2').classList.add('hidden');
    document.getElementById('robloxNickDisplay').textContent = currentUser.roblox_nick || '';
    document.body.style.overflow = 'hidden';
}

function closeRobloxVerifyModal() {
    document.getElementById('robloxVerifyModal').classList.remove('active');
    document.body.style.overflow = '';
}

async function startRobloxVerification() {
    try {
        const response = await api.post('/auth/start-roblox-verification');
        document.getElementById('robloxVerifyCode').textContent = response.code;
        document.getElementById('robloxVerifyStep1').classList.add('hidden');
        document.getElementById('robloxVerifyStep2').classList.remove('hidden');
        showToast('info', 'Код получен', 'Следуйте инструкциям ниже');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function copyRobloxCode() {
    const code = document.getElementById('robloxVerifyCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        showToast('success', 'Скопировано!', 'Теперь вставьте код в описание профиля Roblox');
    }).catch(() => {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        showToast('success', 'Скопировано!', 'Теперь вставьте код в описание профиля Roblox');
    });
}

async function checkRobloxVerification() {
    showToast('info', 'Проверка...', 'Ищем код в вашем профиле Roblox');
    
    try {
        await api.post('/auth/check-roblox-verification');
        closeRobloxVerifyModal();
        currentUser.is_roblox_verified = 1;
        localStorage.setItem('urp_user', JSON.stringify(currentUser));
        showToast('success', '🎉 Верификация пройдена!', 'Ваш Roblox аккаунт подтверждён');
        
        if (!document.getElementById('profileSection').classList.contains('hidden')) {
            openProfile();
        }
    } catch (error) {
        showToast('error', 'Код не найден', 'Убедитесь, что добавили код в описание профиля Roblox и сохранили изменения');
    }
}

// ===== ADMIN PANEL =====
let adminSelectedUser = null;
let adminCurrentTab = 'stats';

function openAdminPanel() {
    closeUserMenu();
    document.getElementById('adminPanelModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    switchAdminTab('stats');
}

function closeAdminPanel() {
    document.getElementById('adminPanelModal').classList.remove('active');
    document.body.style.overflow = '';
    closeAdminUserModal();
}

function switchAdminTab(tab) {
    adminCurrentTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.admin-tab').forEach(btn => {
        btn.classList.toggle('active', btn.onclick.toString().includes(`'${tab}'`));
    });
    
    // Update tab content
    document.querySelectorAll('.admin-tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`adminTab${tab.charAt(0).toUpperCase() + tab.slice(1)}`).classList.add('active');
    
    // Load content
    switch (tab) {
        case 'stats':
            loadAdminStats();
            break;
        case 'users':
            loadAdminUsers();
            break;
        case 'staff':
            loadStaffList();
            break;
        case 'applications':
            loadAdminApplications();
            break;
        case 'posts':
            loadAdminPosts();
            break;
        case 'activity':
            loadAdminActivity();
            break;
    }
}

async function loadAdminStats() {
    try {
        const stats = await api.get('/admin/stats');
        
        document.getElementById('adminStatsGrid').innerHTML = `
            <div class="admin-stat-card highlight">
                <div class="admin-stat-icon">👥</div>
                <div class="admin-stat-value">${stats.totalUsers}</div>
                <div class="admin-stat-label">Всего пользователей</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">📝</div>
                <div class="admin-stat-value">${stats.totalPosts}</div>
                <div class="admin-stat-label">Всего постов</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">💬</div>
                <div class="admin-stat-value">${stats.totalComments}</div>
                <div class="admin-stat-label">Комментариев</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">🆕</div>
                <div class="admin-stat-value">${stats.todayUsers}</div>
                <div class="admin-stat-label">Новых за сегодня</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">📊</div>
                <div class="admin-stat-value">${stats.todayPosts}</div>
                <div class="admin-stat-label">Постов за сегодня</div>
            </div>
            <div class="admin-stat-card" style="border-color: rgba(239, 68, 68, 0.3);">
                <div class="admin-stat-icon">🚫</div>
                <div class="admin-stat-value">${stats.bannedUsers}</div>
                <div class="admin-stat-label">Забанено</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">✉️</div>
                <div class="admin-stat-value">${stats.verifiedEmail}</div>
                <div class="admin-stat-label">Email верифицировано</div>
            </div>
            <div class="admin-stat-card">
                <div class="admin-stat-icon">🎮</div>
                <div class="admin-stat-value">${stats.verifiedRoblox}</div>
                <div class="admin-stat-label">Roblox верифицировано</div>
            </div>
            
            <div style="grid-column: 1 / -1; margin-top: 16px;">
                <h4 style="margin-bottom: 12px; color: var(--primary-400);">📊 По ролям</h4>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    ${Object.entries(stats.roleStats).map(([role, count]) => `
                        <div class="badge" style="padding: 8px 16px;">
                            <i class="fas ${ROLES_INFO[role]?.icon || 'fa-user'}"></i>
                            ${ROLES_INFO[role]?.name || role}: <strong>${count}</strong>
                        </div>
                    `).join('')}
                </div>
            </div>
            
            <div style="grid-column: 1 / -1; margin-top: 16px;">
                <h4 style="margin-bottom: 12px; color: var(--primary-400);">📁 По статусам постов</h4>
                <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                    <span class="status-badge status-open">Открыто: ${stats.statusStats.open}</span>
                    <span class="status-badge status-approved">Принято: ${stats.statusStats.approved}</span>
                    <span class="status-badge status-rejected">Отклонено: ${stats.statusStats.rejected}</span>
                    <span class="status-badge status-resolved">Решено: ${stats.statusStats.resolved}</span>
                </div>
            </div>
        `;
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function loadAdminUsers() {
    const search = document.getElementById('adminUserSearch')?.value || '';
    const role = document.getElementById('adminRoleFilter')?.value || 'all';
    
    try {
        const data = await api.get(`/admin/users/list?search=${encodeURIComponent(search)}&role=${role}&limit=50`);
        
        if (data.users.length === 0) {
            document.getElementById('adminUsersList').innerHTML = `
                <div class="admin-empty">
                    <i class="fas fa-users"></i>
                    <p>Пользователи не найдены</p>
                </div>
            `;
            return;
        }
        
        document.getElementById('adminUsersList').innerHTML = data.users.map(user => {
            const isBanned = user.is_banned === 1 || user.is_banned === true;
            return `
                <div class="admin-user-row ${isBanned ? 'banned' : ''}" data-user-id="${user.id}">
                    <div class="avatar">
                        ${user.avatar_url ? `<img src="${user.avatar_url}" alt="">` : user.avatar || '🎮'}
                    </div>
                    <div class="info">
                        <div class="name" style="color: ${user.roleInfo?.color || 'inherit'}">
                            ${isBanned ? '🚫 ' : ''}${escapeHtml(user.username)}
                        </div>
                        <div class="meta">
                            ${escapeHtml(user.roblox_nick || '')} • ${escapeHtml(user.email || '')} • Rep: ${user.reputation || 0}
                        </div>
                    </div>
                    <div class="badges">
                        ${renderRoleBadge(user.role, user.roleInfo)}
                        ${user.is_email_verified ? '<span class="verify-badge verified" title="Email ✓"><i class="fas fa-envelope"></i></span>' : ''}
                        ${user.is_roblox_verified ? '<span class="verify-badge verified" title="Roblox ✓"><i class="fas fa-gamepad"></i></span>' : ''}
                    </div>
                    <div class="actions">
                        <button class="btn btn-glass btn-sm" onclick="openAdminUserModal('${user.id}')" title="Редактировать">
                            <i class="fas fa-edit"></i>
                        </button>
                        ${isBanned ? `
                            <button class="btn btn-success btn-sm" onclick="unbanUser('${user.id}')" title="Разбанить">
                                <i class="fas fa-unlock"></i>
                            </button>
                        ` : `
                            <button class="btn btn-danger btn-sm" onclick="banUser('${user.id}', '${escapeHtml(user.username)}')" title="Забанить">
                                <i class="fas fa-ban"></i>
                            </button>
                        `}
                    </div>
                </div>
            `;
        }).join('');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function loadAdminPosts() {
    const status = document.getElementById('adminPostStatus')?.value || 'all';
    const category = document.getElementById('adminPostCategory')?.value || 'all';
    
    try {
        const posts = await api.get(`/admin/posts?status=${status}&category=${category}&limit=50`);
        
        if (posts.length === 0) {
            document.getElementById('adminPostsList').innerHTML = `
                <div class="admin-empty">
                    <i class="fas fa-file-alt"></i>
                    <p>Посты не найдены</p>
                </div>
            `;
            return;
        }
        
        document.getElementById('adminPostsList').innerHTML = posts.map(post => `
            <div class="admin-post-row" onclick="viewPost('${post.id}'); closeAdminPanel();">
                <span class="badge badge-category">${categoryNames[post.category]}</span>
                <span class="title">${escapeHtml(post.title)}</span>
                <span class="meta" style="color: var(--text-muted); font-size: 12px;">
                    ${escapeHtml(post.author)} • ${getTimeAgo(post.created_at)}
                </span>
                <span class="status-badge status-${post.status}">${post.status_text || post.status}</span>
                <div class="actions" onclick="event.stopPropagation();">
                    <button class="btn btn-glass btn-sm ${post.is_pinned ? 'active' : ''}" onclick="togglePinPost('${post.id}')" title="${post.is_pinned ? 'Открепить' : 'Закрепить'}">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                    <button class="btn btn-glass btn-sm ${post.is_hot ? 'active' : ''}" onclick="toggleHotPost('${post.id}')" title="${post.is_hot ? 'Убрать из горячего' : 'Сделать горячим'}">
                        <i class="fas fa-fire"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="deletePostAdmin('${post.id}')" title="Удалить">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function loadAdminActivity() {
    try {
        const activity = await api.get('/admin/activity?limit=100');
        
        if (activity.length === 0) {
            document.getElementById('adminActivityList').innerHTML = `
                <div class="admin-empty">
                    <i class="fas fa-history"></i>
                    <p>Нет активности</p>
                </div>
            `;
            return;
        }
        
        document.getElementById('adminActivityList').innerHTML = activity.map(log => `
            <div class="admin-activity-row">
                <span class="time">${new Date(log.created_at).toLocaleString('ru-RU')}</span>
                <span class="user">${escapeHtml(log.username || 'Unknown')}</span>
                <span class="action">${getActionText(log.action)}: ${escapeHtml(log.details || '')}</span>
            </div>
        `).join('');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function getActionText(action) {
    const actions = {
        'register': '📝 Регистрация',
        'login': '🔑 Вход',
        'logout': '🚪 Выход',
        'post_create': '📄 Создан пост',
        'post_delete': '🗑️ Удалён пост',
        'post_status_change': '📊 Изменён статус',
        'comment_create': '💬 Комментарий',
        'profile_update': '👤 Обновление профиля',
        'avatar_upload': '🖼️ Загрузка аватара',
        'email_verified': '✉️ Email подтверждён',
        'roblox_verified': '🎮 Roblox подтверждён',
        'role_change': '🛡️ Изменена роль',
        'user_ban': '🚫 Бан пользователя',
        'user_unban': '✅ Разбан пользователя',
        'user_delete': '❌ Удаление пользователя',
        'message_send': '✉️ Сообщение',
        'favorite_add': '⭐ В избранное',
        'post_pin': '📌 Закрепление поста',
        'post_hot': '🔥 Горячий пост'
    };
    return actions[action] || action;
}

async function openAdminUserModal(userId) {
    try {
        const user = await api.get(`/users/${userId}`);
        adminSelectedUser = user;
        
        const roles = await api.get('/admin/roles');
        
        document.getElementById('adminUserModal').classList.remove('hidden');
        document.getElementById('adminUserCard').innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 20px;">
                <h3 style="margin: 0;">Редактирование пользователя</h3>
                <button class="btn btn-glass btn-sm" onclick="closeAdminUserModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            
            <div class="admin-user-info" style="margin-bottom: 20px;">
                <div class="admin-user-avatar">
                    ${user.avatar_url ? `<img src="${user.avatar_url}" alt="">` : user.avatar}
                </div>
                <div class="admin-user-details">
                    <h3>${escapeHtml(user.username)}</h3>
                    <div class="admin-user-meta">
                        <i class="fas fa-gamepad"></i> ${escapeHtml(user.roblox_nick)}<br>
                        <i class="fas fa-envelope"></i> ${escapeHtml(user.email || 'N/A')}<br>
                        <i class="fas fa-star"></i> Репутация: ${user.reputation}
                    </div>
                </div>
            </div>
            
            <div class="admin-user-badges" style="margin-bottom: 20px;">
                ${renderRoleBadge(user.role, user.roleInfo)}
                ${user.is_email_verified ? '<span class="verify-badge verified"><i class="fas fa-envelope"></i> Email ✓</span>' : '<span class="verify-badge unverified"><i class="fas fa-envelope"></i> Email ✗</span>'}
                ${user.is_roblox_verified ? '<span class="verify-badge verified"><i class="fas fa-gamepad"></i> Roblox ✓</span>' : '<span class="verify-badge unverified"><i class="fas fa-gamepad"></i> Roblox ✗</span>'}
            </div>
            
            <div class="admin-roles-section">
                <h4><i class="fas fa-users-cog"></i> Изменить роль</h4>
                <div class="admin-roles-grid">
                    ${roles.map(role => `
                        <button class="admin-role-btn role-${role.id} ${user.role === role.id ? 'active' : ''}" 
                                onclick="changeUserRole('${user.id}', '${role.id}')">
                            <i class="fas ${role.icon}"></i>
                            <span>${role.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
            
            <div style="margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end;">
                <button class="btn btn-danger" onclick="deleteUserAdmin('${user.id}', '${escapeHtml(user.username)}')">
                    <i class="fas fa-trash"></i> Удалить
                </button>
            </div>
        `;
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function closeAdminUserModal() {
    document.getElementById('adminUserModal').classList.add('hidden');
    adminSelectedUser = null;
}

async function changeUserRole(userId, role) {
    try {
        await api.put(`/admin/users/${userId}/role`, { role });
        showToast('success', 'Успешно', 'Роль изменена');
        closeAdminUserModal();
        loadAdminUsers();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

let banTargetUserId = null;
let banTargetUsername = null;

function banUser(userId, username) {
    banTargetUserId = userId;
    banTargetUsername = username;
    document.getElementById('banUserName').textContent = username;
    document.getElementById('banReasonInput').value = '';
    document.getElementById('banReasonModal').classList.remove('hidden');
}

function closeBanModal() {
    document.getElementById('banReasonModal').classList.add('hidden');
    banTargetUserId = null;
    banTargetUsername = null;
}

async function confirmBan() {
    if (!banTargetUserId) return;
    
    const reason = document.getElementById('banReasonInput').value.trim() || 'Нарушение правил';
    
    try {
        await api.post(`/admin/users/${banTargetUserId}/ban`, { reason });
        showToast('success', 'Забанен', `Пользователь ${banTargetUsername} забанен`);
        closeBanModal();
        loadAdminUsers();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function unbanUser(userId) {
    try {
        await api.post(`/admin/users/${userId}/unban`);
        showToast('success', 'Разбанен', 'Пользователь разбанен');
        loadAdminUsers();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function deleteUserAdmin(userId, username) {
    if (!confirm(`Вы уверены, что хотите УДАЛИТЬ пользователя ${username}?\n\nЭто действие нельзя отменить!`)) return;
    if (!confirm(`Повторное подтверждение: удалить ${username} и все его данные?`)) return;
    
    try {
        await api.delete(`/admin/users/${userId}`);
        showToast('success', 'Удалён', `Пользователь ${username} удалён`);
        closeAdminUserModal();
        loadAdminUsers();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function togglePinPost(postId) {
    try {
        const result = await api.post(`/admin/posts/${postId}/pin`);
        showToast('success', result.pinned ? 'Закреплено' : 'Откреплено', '');
        loadAdminPosts();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function toggleHotPost(postId) {
    try {
        const result = await api.post(`/admin/posts/${postId}/hot`);
        showToast('success', result.hot ? 'Отмечено горячим' : 'Снято с горячего', '');
        loadAdminPosts();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function deletePostAdmin(postId) {
    if (!confirm('Удалить этот пост?')) return;
    
    try {
        await api.delete(`/posts/${postId}`);
        showToast('success', 'Удалено', 'Пост удалён');
        loadAdminPosts();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// Role info for display
const ROLES_INFO = {
    'user': { level: 0, name: 'Пользователь', icon: 'fa-user', color: '#60a5fa' },
    'helper': { level: 1, name: 'Хелпер', icon: 'fa-hands-helping', color: '#22c55e' },
    'moderator': { level: 2, name: 'Модератор', icon: 'fa-shield-alt', color: '#a855f7' },
    'admin': { level: 3, name: 'Администратор', icon: 'fa-crown', color: '#f59e0b' },
    'management': { level: 4, name: 'Руководство', icon: 'fa-star', color: '#ef4444' }
};

// ===== STAFF MANAGEMENT =====
async function loadStaffList() {
    try {
        const data = await api.get('/admin/users/list?limit=200');
        const users = data.users;
        
        const management = users.filter(u => u.role === 'management');
        const admins = users.filter(u => u.role === 'admin');
        const moderators = users.filter(u => u.role === 'moderator');
        const helpers = users.filter(u => u.role === 'helper');
        
        renderStaffList('staffManagement', management, 'management');
        renderStaffList('staffAdmins', admins, 'admin');
        renderStaffList('staffModerators', moderators, 'moderator');
        renderStaffList('staffHelpers', helpers, 'helper');
        
        // Populate role dropdown based on current user level
        populateStaffRoleSelect();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function populateStaffRoleSelect() {
    const select = document.getElementById('staffRole');
    if (!select || !currentUser) return;
    
    const currentLevel = currentUser.roleInfo?.level || 0;
    
    select.innerHTML = '<option value="">Выберите роль...</option>';
    
    // Only show roles lower than current user's level
    if (currentLevel > 1) {
        select.innerHTML += '<option value="helper">🤝 Хелпер</option>';
    }
    if (currentLevel > 2) {
        select.innerHTML += '<option value="moderator">🛡️ Модератор</option>';
    }
    if (currentLevel > 3) {
        select.innerHTML += '<option value="admin">👑 Администратор</option>';
    }
    if (currentLevel > 4) { // Only super-admin could add management
        select.innerHTML += '<option value="management">⭐ Руководство</option>';
    }
    
    if (currentLevel <= 1) {
        select.innerHTML = '<option value="">Недостаточно прав</option>';
        select.disabled = true;
    }
}

function renderStaffList(containerId, users, role) {
    const container = document.getElementById(containerId);
    
    if (users.length === 0) {
        container.innerHTML = '<div class="staff-empty">Нет пользователей</div>';
        return;
    }
    
    container.innerHTML = users.map(user => {
        const isCurrentUser = currentUser && currentUser.id === user.id;
        const isManagement = role === 'management';
        const canDemote = !isCurrentUser && !isManagement;
        
        return `
            <div class="staff-member">
                <div class="avatar">
                    ${user.avatar_url ? `<img src="${user.avatar_url}" alt="">` : user.avatar || '🎮'}
                </div>
                <span class="name">${escapeHtml(user.username)}${isCurrentUser ? ' <span style="color: var(--text-muted);">(вы)</span>' : ''}</span>
                ${canDemote ? `
                    <button class="btn btn-danger btn-sm demote-btn" onclick="demoteStaff('${user.id}', '${escapeHtml(user.username)}', '${role}')" title="Снять роль">
                        <i class="fas fa-user-minus"></i>
                    </button>
                ` : isManagement ? `
                    <span class="verify-badge verified" title="Защищён"><i class="fas fa-lock"></i></span>
                ` : ''}
            </div>
        `;
    }).join('');
}

function updateStaffRoleOptions() {
    const select = document.getElementById('staffRole');
    if (!select || !currentUser) return;
    
    const currentLevel = currentUser.roleInfo?.level || 0;
    
    // Disable options that are >= current user level
    Array.from(select.options).forEach(option => {
        if (option.value) {
            const roleLevel = ROLES_INFO[option.value]?.level || 0;
            option.disabled = roleLevel >= currentLevel;
            if (option.disabled) {
                option.textContent = option.textContent.replace(' (недоступно)', '') + ' (недоступно)';
            }
        }
    });
}

function updateApplicationRoleOptions() {
    const currentLevel = currentUser?.roleInfo?.level || 0;
    
    document.querySelectorAll('.app-role-select').forEach(select => {
        Array.from(select.options).forEach(option => {
            if (option.value) {
                const roleLevel = ROLES_INFO[option.value]?.level || 0;
                option.disabled = roleLevel >= currentLevel;
            }
        });
    });
}

async function assignStaffRole() {
    const username = document.getElementById('staffUsername').value.trim();
    const role = document.getElementById('staffRole').value;
    
    if (!username) {
        showToast('error', 'Ошибка', 'Введите логин пользователя');
        return;
    }
    
    if (!role) {
        showToast('error', 'Ошибка', 'Выберите роль');
        return;
    }
    
    try {
        // First find the user
        let user;
        try {
            user = await api.get(`/admin/users/search/${encodeURIComponent(username)}`);
        } catch (e) {
            showToast('error', 'Не найден', `Пользователь "${username}" не найден`);
            return;
        }
        
        if (!user || !user.id) {
            showToast('error', 'Не найден', `Пользователь "${username}" не найден`);
            return;
        }
        
        // Then assign the role
        await api.put(`/admin/users/${user.id}/role`, { role });
        
        showToast('success', 'Роль назначена', `${username} теперь ${ROLES_INFO[role]?.name || role}`);
        
        // Clear form
        document.getElementById('staffUsername').value = '';
        document.getElementById('staffRole').value = '';
        
        // Reload staff list
        loadStaffList();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== ADMIN APPLICATIONS =====

// Check if current user can manage applications (moderator+)
function canManageApplications() {
    const level = currentUser?.roleInfo?.level || 0;
    return level >= 2; // moderator = 2, admin = 3, management = 4
}

// Get available roles that current user can assign
function getAvailableRolesOptions() {
    const currentLevel = currentUser?.roleInfo?.level || 0;
    let options = '';
    
    if (currentLevel > 1) { // Can assign helper
        options += '<option value="helper">🤝 Хелпер</option>';
    }
    if (currentLevel > 2) { // Can assign moderator (admin+)
        options += '<option value="moderator">🛡️ Модератор</option>';
    }
    if (currentLevel > 3) { // Can assign admin (management only)
        options += '<option value="admin">👑 Админ</option>';
    }
    
    return options || '<option value="helper">🤝 Хелпер</option>';
}

async function loadAdminApplications() {
    const status = document.getElementById('adminAppStatus')?.value || 'pending';
    
    try {
        const applications = await api.get(`/admin/applications?status=${status}`);
        
        // Update badge count
        const countData = await api.get('/admin/applications/count');
        const countBadge = document.getElementById('applicationsCount');
        if (countBadge) {
            if (countData.count > 0) {
                countBadge.textContent = countData.count;
                countBadge.classList.remove('hidden');
            } else {
                countBadge.classList.add('hidden');
            }
        }
        
        const container = document.getElementById('adminApplicationsList');
        
        if (applications.length === 0) {
            container.innerHTML = `
                <div class="admin-empty">
                    <i class="fas fa-file-signature"></i>
                    <p>${status === 'pending' ? 'Нет новых заявок' : 'Заявки не найдены'}</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = applications.map(app => `
            <div class="application-card ${app.status}">
                <div class="application-header">
                    <div class="application-user">
                        <div class="avatar">
                            ${app.avatar_url ? `<img src="${app.avatar_url}" alt="">` : app.avatar || '🎮'}
                        </div>
                        <div class="info">
                            <div class="name">${escapeHtml(app.username || 'Unknown')}</div>
                            <div class="meta">Roblox: ${escapeHtml(app.nick)} • Discord: ${escapeHtml(app.discord)}</div>
                        </div>
                    </div>
                    <div class="application-status">
                        ${app.status === 'pending' ? '<span class="status-badge status-open">Ожидает</span>' : 
                          app.status === 'approved' ? '<span class="status-badge status-approved">Одобрена</span>' : 
                          '<span class="status-badge status-rejected">Отклонена</span>'}
                    </div>
                </div>
                
                <div class="application-details">
                    <div class="detail-row">
                        <span class="label"><i class="fas fa-birthday-cake"></i> Возраст:</span>
                        <span class="value">${app.age} лет</span>
                    </div>
                    <div class="detail-row">
                        <span class="label"><i class="fas fa-clock"></i> Онлайн:</span>
                        <span class="value">${escapeHtml(app.hours)}</span>
                    </div>
                    ${app.experience ? `
                        <div class="detail-row">
                            <span class="label"><i class="fas fa-briefcase"></i> Опыт:</span>
                            <span class="value">${escapeHtml(app.experience)}</span>
                        </div>
                    ` : ''}
                    <div class="detail-row full">
                        <span class="label"><i class="fas fa-comment"></i> Почему хочет в команду:</span>
                        <span class="value">${escapeHtml(app.reason)}</span>
                    </div>
                </div>
                
                <div class="application-footer">
                    <span class="date"><i class="fas fa-calendar"></i> ${new Date(app.created_at).toLocaleString('ru-RU')}</span>
                    ${app.status === 'pending' && canManageApplications() ? `
                        <div class="actions">
                            <select id="appRole_${app.id}" class="app-role-select">
                                ${getAvailableRolesOptions()}
                            </select>
                            <button class="btn btn-success btn-sm" onclick="approveApplication('${app.id}')">
                                <i class="fas fa-check"></i> Принять
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="rejectApplication('${app.id}')">
                                <i class="fas fa-times"></i> Отклонить
                            </button>
                        </div>
                    ` : app.status === 'pending' ? '<span class="text-muted">Только модератор+ может рассматривать</span>' : ''}
                </div>
            </div>
        `).join('');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function approveApplication(appId) {
    const roleSelect = document.getElementById(`appRole_${appId}`);
    const role = roleSelect?.value || 'helper';
    
    if (!confirm(`Одобрить заявку и назначить роль "${ROLES_INFO[role].name}"?`)) return;
    
    try {
        await api.post(`/admin/applications/${appId}/approve`, { role });
        showToast('success', 'Одобрено', 'Заявка одобрена, роль назначена');
        loadAdminApplications();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

let rejectTargetAppId = null;

function rejectApplication(appId) {
    rejectTargetAppId = appId;
    document.getElementById('rejectReasonInput').value = '';
    document.getElementById('rejectReasonModal').classList.remove('hidden');
}

function closeRejectModal() {
    document.getElementById('rejectReasonModal').classList.add('hidden');
    rejectTargetAppId = null;
}

async function confirmReject() {
    if (!rejectTargetAppId) return;
    
    const reason = document.getElementById('rejectReasonInput').value.trim();
    
    try {
        await api.post(`/admin/applications/${rejectTargetAppId}/reject`, { reason });
        showToast('info', 'Отклонено', 'Заявка отклонена');
        closeRejectModal();
        loadAdminApplications();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function demoteStaff(userId, username, currentRole) {
    // Check if trying to demote self
    if (currentUser && currentUser.id === userId) {
        showToast('error', 'Ошибка', 'Нельзя снять роль с себя');
        return;
    }
    
    // Check if trying to demote management
    if (currentRole === 'management') {
        showToast('error', 'Ошибка', 'Нельзя снять роль с руководства проекта');
        return;
    }
    
    if (!confirm(`Снять роль "${ROLES_INFO[currentRole].name}" с пользователя ${username}?\n\nОн станет обычным пользователем.`)) {
        return;
    }
    
    try {
        await api.put(`/admin/users/${userId}/role`, { role: 'user' });
        showToast('success', 'Роль снята', `${username} теперь обычный пользователь`);
        loadStaffList();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== PROFILE =====
async function openProfile(userId = null) {
    closeUserMenu();
    
    const profileUserId = userId || (currentUser ? currentUser.id : null);
    if (!profileUserId) {
        showToast('error', 'Ошибка', 'Пользователь не найден');
        return;
    }
    
    try {
        const profileUser = await api.get(`/users/${profileUserId}`);
        const userPosts = await api.get(`/users/${profileUserId}/posts`);
        
        document.getElementById('heroSection')?.classList.add('hidden');
        document.getElementById('forum')?.classList.add('hidden');
        document.getElementById('postView')?.classList.add('hidden');
        document.getElementById('profileSection')?.classList.remove('hidden');
        
        const statsGrid = document.querySelector('.profile-stats-grid');
        if (statsGrid) statsGrid.classList.remove('hidden');
        
        const avatarEl = document.getElementById('profileAvatar');
        if (avatarEl) {
            if (profileUser.avatar_url) {
                avatarEl.innerHTML = `<img src="${profileUser.avatar_url}" alt="">`;
            } else {
                avatarEl.innerHTML = '';
                avatarEl.textContent = profileUser.avatar || '🎮';
            }
        }
        
        const nameEl = document.getElementById('profileName');
        if (nameEl) nameEl.textContent = profileUser.username;
        
        const robloxEl = document.getElementById('profileRoblox');
        if (robloxEl) robloxEl.textContent = profileUser.roblox_nick || '';
        
        const dateEl = document.getElementById('profileDate');
        if (dateEl) dateEl.textContent = new Date(profileUser.created_at).toLocaleDateString('ru-RU');
        
    const badgesEl = document.querySelector('.profile-badges');
    if (badgesEl) {
            let badgeHTML = renderRoleBadge(profileUser.role, profileUser.roleInfo);
            badgeHTML += `<span class="profile-badge reputation" title="Репутация"><i class="fas fa-star"></i> ${profileUser.reputation || 0}</span>`;
            
            const isOwnProfile = currentUser && currentUser.id === profileUserId;
            if (isOwnProfile) {
                if (profileUser.is_email_verified) {
                    badgeHTML += '<span class="verify-badge verified"><i class="fas fa-envelope"></i> Email ✓</span>';
        } else {
                    badgeHTML += '<span class="verify-badge unverified" onclick="openEmailVerifyModal()"><i class="fas fa-envelope"></i> Подтвердить email</span>';
                }
                
                if (profileUser.is_roblox_verified) {
                    badgeHTML += '<span class="verify-badge verified"><i class="fas fa-gamepad"></i> Roblox ✓</span>';
                } else {
                    badgeHTML += '<span class="verify-badge unverified" onclick="openRobloxVerifyModal()"><i class="fas fa-gamepad"></i> Верифицировать Roblox</span>';
                }
            } else {
                if (profileUser.is_roblox_verified) {
                    badgeHTML += '<span class="verify-badge verified"><i class="fas fa-gamepad"></i> Roblox ✓</span>';
                }
            }
            
        badgesEl.innerHTML = badgeHTML;
    }
    
        const profileMeta = document.querySelector('.profile-meta');
        if (profileMeta) {
            profileMeta.innerHTML = `
                <span><i class="fas fa-gamepad"></i> <span id="profileRoblox">${profileUser.roblox_nick || ''}</span></span>
                <span><i class="fas fa-calendar"></i> <span id="profileDate">${new Date(profileUser.created_at).toLocaleDateString('ru-RU')}</span></span>
            `;
        }
        
        const postsEl = document.getElementById('profilePosts');
        if (postsEl) postsEl.textContent = profileUser.postsCount || 0;
        
        const commentsEl = document.getElementById('profileComments');
        if (commentsEl) commentsEl.textContent = profileUser.commentsCount || 0;
        
        const viewsEl = document.getElementById('profileViews');
        if (viewsEl) viewsEl.textContent = profileUser.viewsSum || 0;
        
    const actionsEl = document.getElementById('profileActions');
        if (actionsEl) {
            if (currentUser && currentUser.id === profileUserId) {
        actionsEl.innerHTML = `
            <button class="btn btn-glass" onclick="openSettings()">
                <i class="fas fa-cog"></i> Настройки
            </button>
        `;
            } else if (currentUser) {
                actionsEl.innerHTML = `
                    <button class="btn btn-primary" onclick="openMessageModal('${profileUserId}', '${escapeHtml(profileUser.username)}')">
                        <i class="fas fa-envelope"></i> Написать
                    </button>
                    <button class="btn btn-glass" onclick="giveReputation('${profileUserId}', 'like')">
                        <i class="fas fa-thumbs-up"></i>
                    </button>
                `;
    } else {
        actionsEl.innerHTML = '';
            }
    }
    
    const postsListEl = document.getElementById('profilePostsList');
        if (postsListEl) {
    if (userPosts.length === 0) {
        postsListEl.innerHTML = '<div class="profile-empty"><i class="fas fa-inbox"></i><p>Пользователь ещё не создал ни одной темы</p></div>';
    } else {
                postsListEl.innerHTML = userPosts.map(post => `
            <div class="profile-post-item" onclick="viewPost('${post.id}')">
                <div>
                    <div class="profile-post-title">${escapeHtml(post.title)}</div>
                    <div class="profile-post-meta">
                                <span class="badge-category">${categoryNames[post.category] || post.category}</span> • 
                                ${getTimeAgo(post.created_at)}
                    </div>
                </div>
                        <span class="status-badge status-${post.status}">${post.status_text || post.status}</span>
            </div>
        `).join('');
            }
    }
    
    window.scrollTo(0, 0);
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function openMyPosts() {
    closeUserMenu();
    if (!currentUser) return;
    openProfile(currentUser.id);
}

// ===== SETTINGS =====
function openSettings() {
    closeUserMenu();
    if (!currentUser) return;
    
    document.getElementById('settingsModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    
    document.getElementById('settingsRoblox').value = currentUser.roblox_nick || '';
    document.getElementById('settingsEmail').value = currentUser.email || '';
    
    // Render avatar upload area
    const avatarGrid = document.getElementById('avatarGrid');
    avatarGrid.innerHTML = `
        <div class="avatar-upload-area" style="grid-column: 1 / -1; margin-bottom: 20px;">
            <div class="avatar-preview" id="settingsAvatarPreview">
                ${currentUser.avatar_url ? `<img src="${currentUser.avatar_url}" alt="">` : currentUser.avatar}
            </div>
            <label class="avatar-upload-btn">
                <i class="fas fa-camera"></i>
                <input type="file" accept="image/*" onchange="uploadAvatar(this)">
            </label>
        </div>
        <p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-size: 13px; margin-bottom: 16px;">Или выберите эмодзи:</p>
        ${avatars.map(avatar => `
            <button type="button" class="avatar-option ${!currentUser.avatar_url && avatar === currentUser.avatar ? 'selected' : ''}" 
                onclick="selectAvatar('${avatar}', this)">
            ${avatar}
        </button>
        `).join('')}
    `;
}

function closeSettingsModal() {
    document.getElementById('settingsModal').classList.remove('active');
    document.body.style.overflow = '';
}

let selectedAvatar = null;
function selectAvatar(avatar, btn) {
    document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
    btn.classList.add('selected');
    selectedAvatar = avatar;
    
    // Update preview
    document.getElementById('settingsAvatarPreview').innerHTML = avatar;
}

async function uploadAvatar(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    if (file.size > 5 * 1024 * 1024) {
        showToast('error', 'Ошибка', 'Файл слишком большой (макс. 5MB)');
        return;
    }
    
    try {
        const response = await api.uploadFile('/users/avatar/upload', file, 'avatar');
        currentUser.avatar_url = response.avatarUrl;
        currentUser.avatar = null;
        localStorage.setItem('urp_user', JSON.stringify(currentUser));
        
        document.getElementById('settingsAvatarPreview').innerHTML = `<img src="${response.avatarUrl}" alt="">`;
        document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
        
        updateAuthUI();
        showToast('success', 'Загружено', 'Аватар обновлён');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function saveSettings(e) {
    e.preventDefault();
    
    if (!currentUser) return;
    
    const robloxNick = document.getElementById('settingsRoblox').value.trim();
    const email = document.getElementById('settingsEmail').value.trim();
    const currentPassword = document.getElementById('settingsCurrentPassword').value;
    const newPassword = document.getElementById('settingsNewPassword').value;
    
    try {
        const updates = { robloxNick, email };
        if (selectedAvatar) updates.avatar = selectedAvatar;
        if (newPassword) {
            updates.currentPassword = currentPassword;
            updates.newPassword = newPassword;
        }
        
        const updatedUser = await api.put(`/users/${currentUser.id}`, updates);
        currentUser = { ...currentUser, ...updatedUser };
        localStorage.setItem('urp_user', JSON.stringify(currentUser));
    
    updateAuthUI();
    closeSettingsModal();
    showToast('success', 'Сохранено', 'Настройки успешно обновлены');
    
    document.getElementById('settingsCurrentPassword').value = '';
    document.getElementById('settingsNewPassword').value = '';
    
    if (!document.getElementById('profileSection').classList.contains('hidden')) {
        openProfile();
        }
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== POSTS =====
function handleCreatePost() {
    if (!currentUser) {
        showToast('info', 'Требуется вход', 'Войдите в аккаунт, чтобы создать тему');
        openAuthModal('login');
        return;
    }
    openCreateModal();
}

function openCreateModal() {
    document.getElementById('createPostModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    goToStep1();
}

function closeCreateModal() {
    document.getElementById('createPostModal').classList.remove('active');
    document.body.style.overflow = '';
    resetPostForm();
}

function goToStep1() {
    document.getElementById('step1').classList.remove('hidden');
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('modalStep').textContent = 'Шаг 1 из 2';
}

function selectPostCategory(category) {
    selectedPostCategory = category;
    
    document.getElementById('step1').classList.add('hidden');
    document.getElementById('step2').classList.remove('hidden');
    document.getElementById('modalStep').textContent = 'Шаг 2 из 2';
    document.getElementById('selectedCategoryBadge').textContent = categoryFormNames[category];
    
    document.querySelectorAll('.form-fields').forEach(f => f.classList.add('hidden'));
    document.getElementById(category + 'Fields').classList.remove('hidden');
}

function resetPostForm() {
    selectedPostCategory = null;
    document.querySelectorAll('#postForm input, #postForm textarea, #postForm select').forEach(el => {
        if (el.type !== 'submit') el.value = '';
    });
}

async function submitPost(e) {
    e.preventDefault();
    
    if (!currentUser || !selectedPostCategory) return;
    
    let title = '';
    let content = '';
    let extraData = {};
    
    switch (selectedPostCategory) {
        case 'complaint':
            const violatorNick = document.getElementById('violatorNick').value.trim();
            const violationRule = document.getElementById('violationRule').value;
            const violationDate = document.getElementById('violationDate').value;
            const violationDesc = document.getElementById('violationDesc').value.trim();
            const proofLink = document.getElementById('proofLink').value.trim();
            
            if (!violatorNick || !violationDesc || !proofLink) {
                showToast('error', 'Ошибка', 'Заполните все обязательные поля и приложите доказательства');
                return;
            }
            
            title = `Жалоба на игрока ${violatorNick}`;
            content = `**Ник нарушителя:** ${violatorNick}\n**Нарушенное правило:** ${violationRule || 'Не указано'}\n**Дата нарушения:** ${violationDate || 'Не указана'}\n\n**Описание:**\n${violationDesc}\n\n**Доказательства:** ${proofLink}`;
            extraData = { violatorNick, violationRule, violationDate, proofLink };
            break;
            
        case 'appeal':
            const appealNick = document.getElementById('appealNick').value.trim();
            const adminNick = document.getElementById('adminNick').value.trim();
            const punishmentType = document.getElementById('punishmentType').value;
            const banReason = document.getElementById('banReason').value.trim();
            const appealReason = document.getElementById('appealReason').value.trim();
            
            if (!appealNick || !adminNick || !appealReason) {
                showToast('error', 'Ошибка', 'Заполните все обязательные поля');
                return;
            }
            
            title = `Апелляция: ${appealNick}`;
            content = `**Игровой ник:** ${appealNick}\n**Администратор:** ${adminNick}\n**Тип наказания:** ${punishmentType || 'Не указан'}\n**Причина наказания:** ${banReason || 'Не указана'}\n\n**Причина апелляции:**\n${appealReason}`;
            extraData = { appealNick, adminNick, punishmentType, banReason };
            break;
            
        case 'question':
            const questionTitle = document.getElementById('questionTitle').value.trim();
            const questionCategory = document.getElementById('questionCategory').value;
            const questionText = document.getElementById('questionText').value.trim();
            
            if (!questionTitle || !questionText) {
                showToast('error', 'Ошибка', 'Заполните все обязательные поля');
                return;
            }
            
            title = questionTitle;
            content = `**Категория:** ${questionCategory}\n\n${questionText}`;
            extraData = { questionCategory };
            break;
            
        case 'suggestion':
            const suggestionTitle = document.getElementById('suggestionTitle').value.trim();
            const suggestionCategory = document.getElementById('suggestionCategory').value;
            const suggestionText = document.getElementById('suggestionText').value.trim();
            
            if (!suggestionTitle || !suggestionText) {
                showToast('error', 'Ошибка', 'Заполните все обязательные поля');
                return;
            }
            
            title = suggestionTitle;
            content = `**Категория:** ${suggestionCategory}\n\n${suggestionText}`;
            extraData = { suggestionCategory };
            break;
    }
    
    try {
        await api.post('/posts', {
        category: categoryMap[selectedPostCategory],
        title,
        content,
            extraData
    });
    
    closeCreateModal();
    renderPosts();
    updateStats();
    showToast('success', 'Тема создана!', 'Ваше обращение успешно опубликовано');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function renderPosts() {
    try {
    const sortBy = document.getElementById('sortSelect')?.value || 'newest';
        const params = new URLSearchParams({
            category: currentCategory,
            search: searchQuery,
            sort: sortBy,
            page: currentPage,
            limit: postsPerPage
        });
        
        const response = await api.get(`/posts?${params}`);
        const { posts, total } = response;
        
    postsTitle.textContent = categoryNames[currentCategory];
        postsCount.textContent = `Показано ${posts.length} из ${total} тем`;
    
        if (posts.length === 0) {
        postsList.innerHTML = '';
        emptyState.classList.remove('hidden');
        loadMoreBtn.classList.add('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
        loadMoreBtn.classList.toggle('hidden', posts.length >= total);
        
        postsList.innerHTML = posts.map((post, index) => {
            const timeAgo = getTimeAgo(post.created_at);
        
        return `
                <article class="post-card ${post.is_pinned ? 'pinned' : ''}" 
                     style="animation-delay: ${index * 0.03}s"
                     onclick="viewPost('${post.id}')">
                <div class="post-content">
                        <div class="post-avatar">
                            ${post.avatar_url ? `<img src="${post.avatar_url}" alt="">` : post.avatar}
                        </div>
                    <div class="post-main">
                        <div class="post-badges">
                                ${post.is_pinned ? '<span class="badge badge-pinned"><i class="fas fa-star"></i> Закреплено</span>' : ''}
                                ${post.is_hot ? '<span class="badge badge-hot"><i class="fas fa-fire"></i> Горячее</span>' : ''}
                            <span class="badge badge-category">${categoryNames[post.category]}</span>
                        </div>
                        <h3 class="post-title">${escapeHtml(post.title)}</h3>
                        <div class="post-meta">
                            <span><i class="fas fa-user"></i> ${escapeHtml(post.author)}</span>
                            <span><i class="fas fa-clock"></i> ${timeAgo}</span>
                        </div>
                    </div>
                    <div class="post-stats">
                            <span class="status-badge status-${post.status}">${post.status_text}</span>
                        <div class="post-counters">
                                <span title="Комментарии"><i class="fas fa-comment"></i> ${post.commentsCount}</span>
                            <span title="Просмотры"><i class="fas fa-eye"></i> ${post.views}</span>
                                ${currentUser ? `
                                    <span title="${post.isFavorite ? 'В избранном' : 'Добавить в избранное'}" 
                                          class="favorite-btn ${post.isFavorite ? 'active' : ''}"
                                          onclick="event.stopPropagation(); toggleFavorite('${post.id}')">
                                        <i class="fas fa-bookmark"></i>
                                    </span>
                                ` : ''}
                        </div>
                    </div>
                </div>
            </article>
        `;
    }).join('');
    
    updateCategoryCounts();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function loadMorePosts() {
    currentPage++;
    renderPosts();
}

function searchPosts() {
    searchQuery = document.getElementById('searchInput').value.trim();
    currentPage = 1;
    renderPosts();
}

function filterByCategory(category) {
    currentCategory = category;
    currentPage = 1;
    searchQuery = '';
    document.getElementById('searchInput').value = '';
    
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
    });
    
    renderPosts();
    document.getElementById('forum').scrollIntoView({ behavior: 'smooth' });
}

async function updateCategoryCounts() {
    try {
        const stats = await api.get('/stats');
        
        document.getElementById('countAll').textContent = stats.totalPosts;
        document.getElementById('countComplaints').textContent = stats.categoryCounts.complaints;
        document.getElementById('countAppeals').textContent = stats.categoryCounts.appeals;
        document.getElementById('countQuestions').textContent = stats.categoryCounts.questions;
        document.getElementById('countSuggestions').textContent = stats.categoryCounts.suggestions;
    } catch (error) {}
}

// ===== POST VIEW =====
async function viewPost(postId) {
    try {
        const post = await api.get(`/posts/${postId}`);
        const comments = await api.get(`/posts/${postId}/comments`);
    
    currentPostId = postId;
    
    document.getElementById('heroSection').classList.add('hidden');
    document.getElementById('forum').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('postView').classList.remove('hidden');
    
        const timeAgo = getTimeAgo(post.created_at);
    
        const isStaff = currentUser && currentUser.roleInfo && currentUser.roleInfo.level >= 1;
        const adminControlsHTML = isStaff ? `
        <div class="admin-controls">
            <div class="admin-controls-title">
                <i class="fas fa-shield-alt"></i>
                    Панель модерации
            </div>
            ${post.status === 'open' ? `
                <button class="btn btn-success btn-sm" onclick="approvePost('${post.id}')">
                    <i class="fas fa-check"></i> Принять
                </button>
                <button class="btn btn-danger btn-sm" onclick="rejectPost('${post.id}')">
                    <i class="fas fa-times"></i> Отклонить
                </button>
                <button class="btn btn-primary btn-sm" onclick="closePostAsResolved('${post.id}')">
                    <i class="fas fa-check-double"></i> Решено
                </button>
            ` : ''}
                ${post.status !== 'open' ? `
                <button class="btn btn-glass btn-sm" onclick="reopenPost('${post.id}')">
                    <i class="fas fa-redo"></i> Открыть заново
                </button>
            ` : ''}
        </div>
    ` : '';
    
    document.getElementById('postFull').innerHTML = `
        <div class="post-full-header">
            <div class="post-full-badges">
                    ${post.is_pinned ? '<span class="badge badge-pinned"><i class="fas fa-star"></i> Закреплено</span>' : ''}
                <span class="badge badge-category">${categoryNames[post.category]}</span>
                    <span class="status-badge status-${post.status}">${post.status_text}</span>
            </div>
            <h1 class="post-full-title">${escapeHtml(post.title)}</h1>
            <div class="post-full-meta">
                    <span onclick="openProfile('${post.author_id}')" style="cursor:pointer;">
                        <i class="fas fa-user"></i> ${escapeHtml(post.author)}
                        ${post.authorRoleInfo && post.authorRoleInfo.level > 0 ? `<span style="color:${post.authorRoleInfo.color}">[${post.authorRoleInfo.name}]</span>` : ''}
                    </span>
                <span><i class="fas fa-clock"></i> ${timeAgo}</span>
                <span><i class="fas fa-eye"></i> ${post.views} просмотров</span>
                <span><i class="fas fa-comment"></i> ${comments.length} комментариев</span>
            </div>
        </div>
        <div class="post-full-content">
            ${formatContent(post.content)}
        </div>
        <div class="post-full-actions">
                ${currentUser ? `
                    <button class="btn btn-glass btn-sm ${post.isFavorite ? 'active' : ''}" onclick="toggleFavorite('${post.id}')">
                        <i class="fas fa-bookmark"></i> ${post.isFavorite ? 'В избранном' : 'В избранное'}
                    </button>
                ` : ''}
                ${currentUser && currentUser.id === post.author_id ? `
                <button class="btn btn-danger btn-sm" onclick="deletePost('${post.id}')">
                    <i class="fas fa-trash"></i> Удалить тему
                </button>
            ` : ''}
        </div>
        ${adminControlsHTML}
    `;
    
        renderComments(postId, comments);
    window.scrollTo(0, 0);
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function goBackToForum() {
    document.getElementById('heroSection').classList.remove('hidden');
    document.getElementById('forum').classList.remove('hidden');
    document.getElementById('postView').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    currentPostId = null;
    renderPosts();
}

async function deletePost(postId) {
    if (!confirm('Вы уверены, что хотите удалить эту тему? Это действие нельзя отменить.')) return;
    
    try {
        await api.delete(`/posts/${postId}`);
    goBackToForum();
    updateStats();
    showToast('success', 'Удалено', 'Тема успешно удалена');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== ADMIN MODERATION =====
async function approvePost(postId) {
    try {
        await api.put(`/posts/${postId}/status`, { status: 'approved', statusText: 'Принято' });
        viewPost(postId);
        showToast('success', 'Принято', 'Тема одобрена');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function rejectPost(postId) {
    const reason = prompt('Укажите причину отклонения (необязательно):');
    
    try {
        await api.put(`/posts/${postId}/status`, { 
            status: 'rejected', 
            statusText: 'Отклонено',
            reason: reason ? `❌ **Тема отклонена.** Причина: ${reason}` : null
        });
        viewPost(postId);
        showToast('info', 'Отклонено', 'Тема отклонена');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function closePostAsResolved(postId) {
    try {
        await api.put(`/posts/${postId}/status`, { status: 'resolved', statusText: 'Решено' });
        viewPost(postId);
        showToast('success', 'Закрыто', 'Тема отмечена как решённая');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function reopenPost(postId) {
    try {
        await api.put(`/posts/${postId}/status`, { status: 'open', statusText: 'Открыто' });
        viewPost(postId);
        showToast('info', 'Открыто', 'Тема снова открыта');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== COMMENTS =====
function renderComments(postId, comments) {
    document.getElementById('commentsSection').innerHTML = `
        <div class="comments-header">
            <h3 class="comments-title">Комментарии (${comments.length})</h3>
        </div>
        
        ${currentUser ? `
            <div class="comment-form">
                <div class="comment-input-wrapper">
                    <textarea class="comment-input" id="commentInput" placeholder="Написать комментарий..." rows="2"></textarea>
                    <button class="btn btn-primary" onclick="submitComment('${postId}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        ` : `
            <div class="comment-form">
                <p style="color: var(--text-muted); text-align: center; padding: 20px;">
                    <a href="#" onclick="openAuthModal('login'); return false;" style="color: var(--primary-400);">Войдите</a>, чтобы оставить комментарий
                </p>
            </div>
        `}
        
        <div class="comments-list">
            ${comments.length === 0 ? `
                <div class="no-comments">
                    <i class="fas fa-comments" style="font-size: 32px; margin-bottom: 12px; opacity: 0.3;"></i>
                    <p>Комментариев пока нет. Будьте первым!</p>
                </div>
            ` : comments.map(comment => `
                <div class="comment ${comment.is_admin_action ? 'comment-admin' : ''}">
                    <div class="comment-avatar">
                        ${comment.avatar_url ? `<img src="${comment.avatar_url}" alt="">` : comment.avatar}
                    </div>
                    <div class="comment-content">
                        <div class="comment-header">
                            <span class="comment-author" style="color: ${comment.authorRoleInfo?.color || 'inherit'}" 
                                  onclick="openProfile('${comment.author_id}')" style="cursor:pointer;">
                                ${comment.authorRoleInfo && comment.authorRoleInfo.level > 0 ? `<i class="fas ${comment.authorRoleInfo.icon}"></i> ` : ''}${escapeHtml(comment.author)}
                            </span>
                            <span class="comment-date">${getTimeAgo(comment.created_at)}</span>
                        </div>
                        <p class="comment-text">${comment.is_admin_action ? formatContent(comment.text) : escapeHtml(comment.text)}</p>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

async function submitComment(postId) {
    if (!currentUser) return;
    
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    
    if (!text) {
        showToast('error', 'Ошибка', 'Введите текст комментария');
        return;
    }
    
    try {
        await api.post(`/posts/${postId}/comments`, { text });
        const comments = await api.get(`/posts/${postId}/comments`);
        renderComments(postId, comments);
        showToast('success', 'Отправлено', 'Комментарий добавлен');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== FAVORITES =====
async function toggleFavorite(postId) {
    if (!currentUser) {
        showToast('info', 'Требуется вход', 'Войдите, чтобы добавить в избранное');
        openAuthModal('login');
        return;
    }
    
    try {
        const post = await api.get(`/posts/${postId}`);
        if (post.isFavorite) {
            await api.delete(`/favorites/${postId}`);
            showToast('info', 'Удалено', 'Тема удалена из избранного');
        } else {
            await api.post(`/favorites/${postId}`);
            showToast('success', 'Добавлено', 'Тема добавлена в избранное');
        }
        
        if (currentPostId === postId) {
            viewPost(postId);
        } else {
            renderPosts();
        }
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function openFavorites() {
    closeUserMenu();
    if (!currentUser) return;
    
    try {
        const favorites = await api.get('/favorites');
        
        document.getElementById('heroSection').classList.add('hidden');
        document.getElementById('forum').classList.add('hidden');
        document.getElementById('postView').classList.add('hidden');
        document.getElementById('profileSection').classList.remove('hidden');
        
        document.getElementById('profileAvatar').innerHTML = '';
        document.getElementById('profileAvatar').textContent = '⭐';
        document.getElementById('profileName').textContent = 'Избранное';
        const profileBadges = document.querySelector('.profile-badges');
        if (profileBadges) profileBadges.innerHTML = `<span class="profile-badge user"><i class="fas fa-bookmark"></i> ${favorites.length} тем</span>`;
        const profileMeta = document.querySelector('.profile-meta');
        if (profileMeta) profileMeta.innerHTML = '';
        const statsGrid = document.querySelector('.profile-stats-grid');
        if (statsGrid) statsGrid.classList.add('hidden');
        document.getElementById('profileActions').innerHTML = '';
        
        const postsListEl = document.getElementById('profilePostsList');
        if (favorites.length === 0) {
            postsListEl.innerHTML = '<div class="profile-empty"><i class="fas fa-bookmark"></i><p>Вы ещё ничего не добавили в избранное</p></div>';
        } else {
            postsListEl.innerHTML = favorites.map(post => `
                <div class="profile-post-item" onclick="viewPost('${post.id}')">
                    <div>
                        <div class="profile-post-title">${escapeHtml(post.title)}</div>
                        <div class="profile-post-meta">
                            <span class="badge-category">${categoryNames[post.category]}</span> • 
                            ${post.author} • ${getTimeAgo(post.created_at)}
                        </div>
                    </div>
                    <span class="status-badge status-${post.status}">${post.status_text}</span>
                </div>
            `).join('');
        }
        
        window.scrollTo(0, 0);
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== MESSAGES =====
async function openMessages() {
    closeUserMenu();
    if (!currentUser) return;
    
    try {
        const conversations = await api.get('/messages');
        
        document.getElementById('heroSection').classList.add('hidden');
        document.getElementById('forum').classList.add('hidden');
        document.getElementById('postView').classList.add('hidden');
        document.getElementById('profileSection').classList.remove('hidden');
        
        document.getElementById('profileAvatar').innerHTML = '';
        document.getElementById('profileAvatar').textContent = '✉️';
        document.getElementById('profileName').textContent = 'Личные сообщения';
        const profileBadges = document.querySelector('.profile-badges');
        if (profileBadges) profileBadges.innerHTML = `<span class="profile-badge user"><i class="fas fa-envelope"></i> ${conversations.length} диалогов</span>`;
        const profileMeta = document.querySelector('.profile-meta');
        if (profileMeta) profileMeta.innerHTML = '';
        const statsGrid = document.querySelector('.profile-stats-grid');
        if (statsGrid) statsGrid.classList.add('hidden');
        document.getElementById('profileActions').innerHTML = '';
        
        const postsListEl = document.getElementById('profilePostsList');
        if (conversations.length === 0) {
            postsListEl.innerHTML = '<div class="profile-empty"><i class="fas fa-envelope"></i><p>У вас пока нет сообщений</p></div>';
        } else {
            postsListEl.innerHTML = conversations.map(conv => `
                <div class="profile-post-item conversation-item" onclick="openConversation('${conv.user_id}', '${escapeHtml(conv.username)}')">
                    <div class="conv-avatar">
                        ${conv.avatar_url ? `<img src="${conv.avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : conv.avatar}
                    </div>
                    <div class="conv-info">
                        <div class="conv-name">
                            ${conv.username}
                            ${conv.unread_count > 0 ? `<span class="unread-badge">${conv.unread_count}</span>` : ''}
                        </div>
                        <div class="conv-preview">${escapeHtml(conv.last_message?.substring(0, 50) || '')}...</div>
                    </div>
                    <div class="conv-time">${conv.last_message_at ? getTimeAgo(conv.last_message_at) : ''}</div>
                </div>
            `).join('');
        }
        
        window.scrollTo(0, 0);
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function openConversation(userId, username) {
    try {
        const messages = await api.get(`/messages/${userId}`);
        
        const postsListEl = document.getElementById('profilePostsList');
        document.getElementById('profileName').textContent = `Диалог с ${username}`;
        document.querySelector('.profile-badges').innerHTML = `
            <button class="btn btn-glass btn-sm" onclick="openMessages()">
                <i class="fas fa-arrow-left"></i> Назад
            </button>
        `;
        
        postsListEl.innerHTML = `
            <div class="messages-container">
                <div class="messages-list" id="messagesList">
                    ${messages.map(msg => `
                        <div class="message ${msg.sender_id === currentUser.id ? 'sent' : 'received'}">
                            <div class="message-avatar">
                                ${msg.sender_avatar_url ? `<img src="${msg.sender_avatar_url}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">` : msg.sender_avatar}
                            </div>
                            <div class="message-bubble">
                                <div class="message-text">${escapeHtml(msg.content)}</div>
                                <div class="message-time">${getTimeAgo(msg.created_at)}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="message-input-area">
                    <textarea class="message-input" id="messageInput" placeholder="Написать сообщение..."></textarea>
                    <button class="btn btn-primary" onclick="sendMessage('${userId}')">
                        <i class="fas fa-paper-plane"></i>
                    </button>
                </div>
            </div>
        `;
        
        const messagesList = document.getElementById('messagesList');
        messagesList.scrollTop = messagesList.scrollHeight;
        
        loadMessagesCount();
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function sendMessage(receiverId) {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    
    if (!content) return;
    
    try {
        await api.post('/messages', { receiverId, content });
        input.value = '';
        
        const user = await api.get(`/users/${receiverId}`);
        openConversation(receiverId, user.username);
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function openMessageModal(userId, username) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay active';
    modal.id = 'messageModal';
    modal.innerHTML = `
        <div class="modal" onclick="event.stopPropagation()">
            <div class="modal-header">
                <div>
                    <h2 class="modal-title">Написать ${username}</h2>
                    <p class="modal-subtitle">Новое личное сообщение</p>
                </div>
                <button class="modal-close" onclick="closeMessageModal()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="form-group">
                <label><i class="fas fa-comment"></i> Сообщение</label>
                <textarea id="newMessageContent" rows="5" placeholder="Введите ваше сообщение..."></textarea>
            </div>
            <div class="form-actions">
                <button class="btn btn-glass" onclick="closeMessageModal()">Отмена</button>
                <button class="btn btn-primary" onclick="sendNewMessage('${userId}')">
                    <i class="fas fa-paper-plane"></i> Отправить
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';
}

function closeMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
        modal.remove();
        document.body.style.overflow = '';
    }
}

async function sendNewMessage(receiverId) {
    const content = document.getElementById('newMessageContent').value.trim();
    if (!content) {
        showToast('error', 'Ошибка', 'Введите сообщение');
        return;
    }
    
    try {
        await api.post('/messages', { receiverId, content });
        closeMessageModal();
        showToast('success', 'Отправлено', 'Сообщение отправлено');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function loadMessagesCount() {
    if (!currentUser) return;
    try {
        const data = await api.get('/messages/unread/count');
        unreadMessages = data.count;
        updateBadges();
    } catch (error) {}
}

// ===== NOTIFICATIONS =====
async function openNotifications() {
    closeUserMenu();
    if (!currentUser) return;
    
    try {
        const notifications = await api.get('/notifications');
        
        document.getElementById('heroSection').classList.add('hidden');
        document.getElementById('forum').classList.add('hidden');
        document.getElementById('postView').classList.add('hidden');
        document.getElementById('profileSection').classList.remove('hidden');
        
        document.getElementById('profileAvatar').innerHTML = '';
        document.getElementById('profileAvatar').textContent = '🔔';
        document.getElementById('profileName').textContent = 'Уведомления';
        const profileBadges = document.querySelector('.profile-badges');
        if (profileBadges) {
            profileBadges.innerHTML = `
                <span class="profile-badge user"><i class="fas fa-bell"></i> ${notifications.length} уведомлений</span>
                ${notifications.filter(n => !n.is_read).length > 0 ? `
                    <button class="btn btn-glass btn-sm" onclick="markAllNotificationsRead()">
                        Прочитать все
                    </button>
                ` : ''}
            `;
        }
        const profileMeta = document.querySelector('.profile-meta');
        if (profileMeta) profileMeta.innerHTML = '';
        const statsGrid = document.querySelector('.profile-stats-grid');
        if (statsGrid) statsGrid.classList.add('hidden');
        document.getElementById('profileActions').innerHTML = '';
        
        const postsListEl = document.getElementById('profilePostsList');
        if (notifications.length === 0) {
            postsListEl.innerHTML = '<div class="profile-empty"><i class="fas fa-bell"></i><p>У вас пока нет уведомлений</p></div>';
        } else {
            postsListEl.innerHTML = notifications.map(notif => `
                <div class="profile-post-item notification-item ${notif.is_read ? '' : 'unread'}" 
                     onclick="handleNotificationClick('${notif.id}', '${notif.link || ''}')">
                    <div class="notif-icon ${notif.type}">
                        <i class="fas fa-${getNotificationIcon(notif.type)}"></i>
                    </div>
                    <div>
                        <div class="profile-post-title">${notif.title}</div>
                        <div class="profile-post-meta">${notif.message}</div>
                    </div>
                    <div class="notif-time">${getTimeAgo(notif.created_at)}</div>
                </div>
            `).join('');
        }
        
        window.scrollTo(0, 0);
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

function getNotificationIcon(type) {
    const icons = {
        comment: 'comment',
        message: 'envelope',
        post_status: 'flag',
        reputation: 'star',
        role: 'user-shield',
        system: 'info-circle'
    };
    return icons[type] || 'bell';
}

async function handleNotificationClick(notifId, link) {
    try {
        await api.put(`/notifications/${notifId}/read`);
        loadNotificationsCount();
        
        if (link) {
            if (link.startsWith('/post/')) {
                viewPost(link.replace('/post/', ''));
            } else if (link.startsWith('/messages/')) {
                const userId = link.replace('/messages/', '');
                const user = await api.get(`/users/${userId}`);
                openConversation(userId, user.username);
            }
        }
    } catch (error) {}
}

async function markAllNotificationsRead() {
    try {
        await api.put('/notifications/read-all');
        loadNotificationsCount();
        openNotifications();
        showToast('success', 'Готово', 'Все уведомления прочитаны');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

async function loadNotificationsCount() {
    if (!currentUser) return;
    try {
        const data = await api.get('/notifications/unread/count');
        unreadNotifications = data.count;
        updateBadges();
    } catch (error) {}
}

function updateBadges() {
    // Update notification badge in user menu
    const userDropdown = document.getElementById('userDropdown');
    if (userDropdown) {
        const notifLink = userDropdown.querySelector('[onclick*="openNotifications"]');
        if (notifLink && unreadNotifications > 0) {
            if (!notifLink.querySelector('.menu-badge')) {
                notifLink.innerHTML += `<span class="menu-badge">${unreadNotifications}</span>`;
            }
        }
        
        const msgLink = userDropdown.querySelector('[onclick*="openMessages"]');
        if (msgLink && unreadMessages > 0) {
            if (!msgLink.querySelector('.menu-badge')) {
                msgLink.innerHTML += `<span class="menu-badge">${unreadMessages}</span>`;
            }
        }
    }
}

// ===== REPUTATION =====
async function giveReputation(targetUserId, type) {
    if (!currentUser) {
        showToast('info', 'Требуется вход', 'Войдите, чтобы оценить');
        openAuthModal('login');
        return;
    }
    
    try {
        await api.post('/reputation', { targetUserId, type });
        showToast('success', 'Готово', type === 'like' ? 'Вы поставили лайк!' : 'Оценка учтена');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== STATS =====
async function updateStats() {
    try {
        const stats = await api.get('/stats');
        document.getElementById('totalPosts').textContent = stats.totalPosts;
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('onlineUsers').textContent = stats.onlineUsers;
    } catch (error) {}
}

async function updateOnlineUsers() {
    try {
        const users = await api.get('/users/online/list');
    const onlineList = document.getElementById('onlineList');
    
        if (users.length === 0) {
            onlineList.innerHTML = '<div class="online-empty">Никого онлайн</div>';
        } else {
            onlineList.innerHTML = users.map(user => `
                <div class="online-user" onclick="openProfile('${user.id}')" style="cursor:pointer;">
                    <span class="user-dot"></span>
                    <span style="color: ${user.roleInfo?.color || 'inherit'}">${user.username}</span>
                </div>
            `).join('');
        }
        
        document.getElementById('onlineUsers').textContent = users.length || '1';
    } catch (error) {
        const onlineList = document.getElementById('onlineList');
    if (currentUser) {
        onlineList.innerHTML = `
            <div class="online-user">
                <span class="user-dot"></span>
                <span>${currentUser.username}</span>
            </div>
        `;
    } else {
        onlineList.innerHTML = '<div class="online-empty">Гости</div>';
        }
    }
}

// ===== MODALS =====
function showRules() {
    document.getElementById('rulesModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeRulesModal() {
    document.getElementById('rulesModal').classList.remove('active');
    document.body.style.overflow = '';
}

function showForumRules() {
    document.getElementById('forumRulesModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeForumRulesModal() {
    document.getElementById('forumRulesModal').classList.remove('active');
    document.body.style.overflow = '';
}

function showFAQ() {
    document.getElementById('faqModal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeFAQModal() {
    document.getElementById('faqModal').classList.remove('active');
    document.body.style.overflow = '';
}

function toggleFAQ(element) {
    const item = element.closest('.faq-item');
    item.classList.toggle('active');
}

// ===== ADMIN APPLICATION =====
function openAdminApplication() {
    if (!currentUser) {
        showToast('info', 'Требуется вход', 'Войдите в аккаунт, чтобы подать заявку');
        openAuthModal('login');
        return;
    }
    
    document.getElementById('adminApplicationModal').classList.add('active');
    document.body.style.overflow = 'hidden';
    document.getElementById('adminAppNick').value = currentUser.roblox_nick || '';
}

function closeAdminApplicationModal() {
    document.getElementById('adminApplicationModal').classList.remove('active');
    document.body.style.overflow = '';
    ['adminAppNick', 'adminAppAge', 'adminAppHours', 'adminAppExperience', 'adminAppReason', 'adminAppDiscord'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
}

async function submitAdminApplication(e) {
    e.preventDefault();
    
    if (!currentUser) return;
    
    const nick = document.getElementById('adminAppNick').value.trim();
    const age = parseInt(document.getElementById('adminAppAge').value);
    const hours = document.getElementById('adminAppHours').value;
    const experience = document.getElementById('adminAppExperience').value.trim();
    const reason = document.getElementById('adminAppReason').value.trim();
    const discord = document.getElementById('adminAppDiscord').value.trim();
    
    if (!nick || !age || !hours || !reason || !discord) {
        showToast('error', 'Ошибка', 'Заполните все обязательные поля');
        return;
    }
    
    try {
        await api.post('/admin-applications', { nick, age, hours, experience, reason, discord });
    closeAdminApplicationModal();
    showToast('success', 'Заявка отправлена!', 'С вами свяжутся в Discord');
    } catch (error) {
        showToast('error', 'Ошибка', error.message);
    }
}

// ===== NAVIGATION =====
function goHome() {
    document.getElementById('heroSection').classList.remove('hidden');
    document.getElementById('forum').classList.remove('hidden');
    document.getElementById('postView').classList.add('hidden');
    document.getElementById('profileSection').classList.add('hidden');
    document.querySelector('.profile-stats-grid').classList.remove('hidden');
    window.scrollTo(0, 0);
}

// ===== UTILITIES =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatContent(content) {
    return escapeHtml(content)
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'только что';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} мин. назад`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} ч. назад`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)} дн. назад`;
    
    return date.toLocaleDateString('ru-RU');
}

// ===== EVENT LISTENERS =====
document.getElementById('categoryList').addEventListener('click', (e) => {
    const btn = e.target.closest('.category-btn');
    if (btn) filterByCategory(btn.dataset.category);
});

document.getElementById('mobileMenuBtn').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('active');
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});

// Email validation on input
document.getElementById('regEmail')?.addEventListener('blur', function() {
    const email = this.value.trim().toLowerCase();
    if (!email) return;
    
    const validation = validateEmail(email);
    const hintEl = document.getElementById('emailHint');
    
    if (!validation.valid || validation.suggestion) {
        if (!hintEl) {
            const hint = document.createElement('div');
            hint.id = 'emailHint';
            hint.className = 'email-hint';
            this.parentNode.appendChild(hint);
        }
        const el = document.getElementById('emailHint');
        if (validation.suggestion) {
            el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${validation.error} <a href="#" onclick="useEmailSuggestion('${validation.suggestion}'); return false;">Исправить</a>`;
            el.className = 'email-hint warning';
        } else {
            el.innerHTML = `<i class="fas fa-times-circle"></i> ${validation.error}`;
            el.className = 'email-hint error';
        }
    } else {
        if (hintEl) hintEl.remove();
    }
});

function useEmailSuggestion(suggestion) {
    document.getElementById('regEmail').value = suggestion;
    const hintEl = document.getElementById('emailHint');
    if (hintEl) {
        hintEl.innerHTML = '<i class="fas fa-check-circle"></i> Email исправлен';
        hintEl.className = 'email-hint success';
        setTimeout(() => hintEl.remove(), 2000);
    }
}

window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    navbar.style.background = window.pageYOffset > 100 
        ? 'rgba(15, 23, 42, 0.95)' 
        : 'rgba(15, 23, 42, 0.7)';
});

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href !== '#') {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });
});

// ===== INITIALIZATION =====
async function init() {
    const savedUser = localStorage.getItem('urp_user');
    const savedToken = localStorage.getItem('urp_token');
    
    if (savedUser && savedToken) {
        try {
            api.token = savedToken;
            currentUser = await api.get('/auth/me');
            localStorage.setItem('urp_user', JSON.stringify(currentUser));
        } catch (error) {
            api.setToken(null);
            localStorage.removeItem('urp_user');
            currentUser = null;
        }
    }
    
    updateAuthUI();
    renderPosts();
    updateStats();
    updateOnlineUsers();
    
    if (currentUser) {
        loadNotificationsCount();
        loadMessagesCount();
    }
    
    console.log('🎮 Unfiltered RP Forum loaded');
}

document.addEventListener('DOMContentLoaded', init);

// Refresh online users every 30 seconds
setInterval(updateOnlineUsers, 30000);

// ===== GLOBAL EXPORTS =====
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthForm = switchAuthForm;
window.togglePassword = togglePassword;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.checkPasswordStrength = checkPasswordStrength;
window.checkPasswordMatch = checkPasswordMatch;
window.showWelcomeModal = showWelcomeModal;
window.closeWelcomeModal = closeWelcomeModal;
window.logout = logout;
window.toggleUserMenu = toggleUserMenu;
window.openProfile = openProfile;
window.openMyPosts = openMyPosts;
window.openSettings = openSettings;
window.closeSettingsModal = closeSettingsModal;
window.selectAvatar = selectAvatar;
window.uploadAvatar = uploadAvatar;
window.saveSettings = saveSettings;
window.handleCreatePost = handleCreatePost;
window.closeCreateModal = closeCreateModal;
window.goToStep1 = goToStep1;
window.selectPostCategory = selectPostCategory;
window.submitPost = submitPost;
window.viewPost = viewPost;
window.goBackToForum = goBackToForum;
window.deletePost = deletePost;
window.submitComment = submitComment;
window.filterByCategory = filterByCategory;
window.loadMorePosts = loadMorePosts;
window.searchPosts = searchPosts;
window.showRules = showRules;
window.closeRulesModal = closeRulesModal;
window.showForumRules = showForumRules;
window.closeForumRulesModal = closeForumRulesModal;
window.showFAQ = showFAQ;
window.closeFAQModal = closeFAQModal;
window.toggleFAQ = toggleFAQ;
window.goHome = goHome;
window.openAdminApplication = openAdminApplication;
window.closeAdminApplicationModal = closeAdminApplicationModal;
window.submitAdminApplication = submitAdminApplication;
window.approvePost = approvePost;
window.rejectPost = rejectPost;
window.closePostAsResolved = closePostAsResolved;
window.reopenPost = reopenPost;
window.toggleFavorite = toggleFavorite;
window.openFavorites = openFavorites;
window.openMessages = openMessages;
window.openConversation = openConversation;
window.sendMessage = sendMessage;
window.openMessageModal = openMessageModal;
window.closeMessageModal = closeMessageModal;
window.sendNewMessage = sendNewMessage;
window.openNotifications = openNotifications;
window.handleNotificationClick = handleNotificationClick;
window.markAllNotificationsRead = markAllNotificationsRead;
window.giveReputation = giveReputation;
window.openAdminPanel = openAdminPanel;
window.closeAdminPanel = closeAdminPanel;
window.switchAdminTab = switchAdminTab;
window.loadAdminUsers = loadAdminUsers;
window.loadAdminPosts = loadAdminPosts;
window.openAdminUserModal = openAdminUserModal;
window.closeAdminUserModal = closeAdminUserModal;
window.changeUserRole = changeUserRole;
window.banUser = banUser;
window.unbanUser = unbanUser;
window.deleteUserAdmin = deleteUserAdmin;
window.togglePinPost = togglePinPost;
window.toggleHotPost = toggleHotPost;
window.deletePostAdmin = deletePostAdmin;
window.assignStaffRole = assignStaffRole;
window.demoteStaff = demoteStaff;
window.loadAdminApplications = loadAdminApplications;
window.approveApplication = approveApplication;
window.rejectApplication = rejectApplication;
window.closeBanModal = closeBanModal;
window.confirmBan = confirmBan;
window.closeRejectModal = closeRejectModal;
window.confirmReject = confirmReject;
window.openEmailVerifyModal = openEmailVerifyModal;
window.closeEmailVerifyModal = closeEmailVerifyModal;
window.verifyEmail = verifyEmail;
window.refreshEmailCode = refreshEmailCode;
window.openRobloxVerifyModal = openRobloxVerifyModal;
window.closeRobloxVerifyModal = closeRobloxVerifyModal;
window.startRobloxVerification = startRobloxVerification;
window.copyRobloxCode = copyRobloxCode;
window.checkRobloxVerification = checkRobloxVerification;
window.useEmailSuggestion = useEmailSuggestion;
