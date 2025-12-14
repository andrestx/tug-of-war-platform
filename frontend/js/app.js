class Application {
    constructor() {
        this.currentScreen = 'welcome';
        this.init();
    }

    async init() {
        // Check authentication status
        await this.checkAuth();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Handle hash routing
        this.handleRouting();
        
        // Hide loading screen
        setTimeout(() => {
            document.getElementById('loading-screen').style.display = 'none';
            document.getElementById('app').style.display = 'block';
        }, 1000);
    }

    async checkAuth() {
        const user = authManager.getUser();
        if (user) {
            this.updateNavForUser(user);
            this.showUserDashboard(user.role);
        }
    }

    setupEventListeners() {
        // Role selection
        document.getElementById('select-student').addEventListener('click', () => this.selectRole('student'));
        document.getElementById('select-teacher').addEventListener('click', () => this.selectRole('teacher'));

        // Navigation
        document.getElementById('home-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showWelcomeScreen();
        });

        document.getElementById('profile-link').addEventListener('click', (e) => {
            e.preventDefault();
            this.showProfileScreen();
        });

        document.getElementById('sessions-link').addEventListener('click', (e) => {
            e.preventDefault();
            const user = authManager.getUser();
            if (user) {
                if (user.role === 'teacher') {
                    this.showTeacherDashboard();
                } else {
                    this.showStudentDashboard();
                }
            }
        });

        document.getElementById('logout-link').addEventListener('click', (e) => {
            e.preventDefault();
            authManager.logout();
        });

        // Mobile menu toggle
        document.getElementById('menu-toggle').addEventListener('click', () => {
            const navLinks = document.getElementById('nav-links');
            navLinks.classList.toggle('active');
        });

        // Session joining
        document.getElementById('join-session-btn')?.addEventListener('click', () => this.joinSession());

        // Session creation
        document.getElementById('create-session-btn')?.addEventListener('click', () => this.showCreateSessionScreen());
        document.getElementById('save-session-btn')?.addEventListener('click', () => this.saveSession());
        document.getElementById('add-question-btn')?.addEventListener('click', () => this.addQuestion());

        // Back button
        document.getElementById('back-to-dashboard')?.addEventListener('click', () => {
            const user = authManager.getUser();
            if (user?.role === 'teacher') {
                this.showTeacherDashboard();
            }
        });

        // Session code input - auto uppercase and limit to 6 chars
        const sessionCodeInput = document.getElementById('session-code-input');
        if (sessionCodeInput) {
            sessionCodeInput.addEventListener('input', (e) => {
                e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
            });
        }
    }

    handleRouting() {
        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.substring(1);
            this.handleHashRoute(hash);
        });

        // Handle initial hash
        this.handleHashRoute(window.location.hash.substring(1));
    }

    handleHashRoute(hash) {
        switch(hash) {
            case 'teacher-dashboard':
                if (authManager.isAuthenticated() && authManager.userRole === 'teacher') {
                    this.showTeacherDashboard();
                }
                break;
            case 'student-dashboard':
                if (authManager.isAuthenticated() && authManager.userRole === 'student') {
                    this.showStudentDashboard();
                }
                break;
            case 'create-session':
                if (authManager.isAuthenticated() && authManager.userRole === 'teacher') {
                    this.showCreateSessionScreen();
                }
                break;
            default:
                if (!authManager.isAuthenticated()) {
                    this.showWelcomeScreen();
                }
        }
    }

    selectRole(role) {
        authManager.userRole = role;
        this.showAuthScreen();
    }

    showScreen(screenId) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Show selected screen
        const screen = document.getElementById(screenId);
        if (screen) {
            screen.classList.add('active');
            this.currentScreen = screenId;
        }

        // Update navigation
        this.updateNavForScreen(screenId);
    }

    updateNavForScreen(screenId) {
        const navLinks = document.querySelectorAll('.nav-link');
        navLinks.forEach(link => link.classList.remove('active'));

        switch(screenId) {
            case 'teacher-dashboard':
            case 'student-dashboard':
                document.getElementById('sessions-link').classList.add('active');
                break;
            case 'welcome-screen':
                document.getElementById('home-link').classList.add('active');
                break;
        }
    }

    updateNavForUser(user) {
        const navLinks = document.getElementById('nav-links');
        if (user) {
            navLinks.classList.remove('hidden');
        } else {
            navLinks.classList.add('hidden');
        }
    }

    showWelcomeScreen() {
        if (authManager.isAuthenticated()) {
            this.showUserDashboard(authManager.userRole);
        } else {
            this.showScreen('welcome-screen');
        }
    }

    showAuthScreen() {
        this.showScreen('auth-screen');
        this.initFirebaseUI();
    }

    showUserDashboard(role) {
        if (role === 'teacher') {
            this.showTeacherDashboard();
        } else if (role === 'student') {
            this.showStudentDashboard();
        }
    }

    async showTeacherDashboard() {
        if (!authManager.isAuthenticated() || authManager.userRole !== 'teacher') {
            this.showWelcomeScreen();
            return;
        }

        this.showScreen('teacher-dashboard');
        await this.loadTeacherDashboard();
    }

    async showStudentDashboard() {
        if (!authManager.isAuthenticated() || authManager.userRole !== 'student') {
            this.showWelcomeScreen();
            return;
        }

        this.showScreen('student-dashboard');
        await this.loadStudentDashboard();
    }

    showCreateSessionScreen() {
        if (!authManager.isAuthenticated() || authManager.userRole !== 'teacher') {
            this.showWelcomeScreen();
            return;
        }

        this.showScreen('create-session-screen');
        this.initQuestionBuilder();
    }

    showProfileScreen() {
        // TODO: Implement profile screen
        console.log('Show profile screen');
    }

    initFirebaseUI() {
        const uiConfig = {
            callbacks: {
                signInSuccessWithAuthResult: function(authResult, redirectUrl) {
                    // User successfully signed in
                    return true;
                },
                uiShown: function() {
                    // The widget is rendered
                    document.getElementById('loading-screen').style.display = 'none';
                }
            },
            signInFlow: 'popup',
            signInSuccessUrl: '#',
            signInOptions: [
                firebase.auth.GoogleAuthProvider.PROVIDER_ID,
                {
                    provider: firebase.auth.EmailAuthProvider.PROVIDER_ID,
                    requireDisplayName: true
                }
            ],
            credentialHelper: firebaseui.auth.CredentialHelper.GOOGLE_YOLO
        };

        const ui = new firebaseui.auth.AuthUI(firebase.auth());
        ui.start('#firebaseui-auth-container', uiConfig);
    }

    async loadTeacherDashboard() {
        try {
            const [sessions, stats] = await Promise.all([
                api.getSessions(),
                api.getUserStats()
            ]);

            this.renderSessionsTable(sessions);
            this.renderTeacherStats(stats);
        } catch (error) {
            console.error('Load dashboard error:', error);
            authManager.showToast('Eroare la încărcarea dashboard-ului', 'error');
        }
    }

    async loadStudentDashboard() {
        try {
            const user = authManager.getUser();
            if (user) {
                document.getElementById('student-name').textContent = user.name;
                document.getElementById('student-avatar').textContent = user.name.charAt(0).toUpperCase();
            }

            // Load active games and history
            // TODO: Implement based on your API
        } catch (error) {
            console.error('Load student dashboard error:', error);
        }
    }

    renderSessionsTable(sessions) {
        const tbody = document.getElementById('sessions-list');
        if (!tbody) return;

        tbody.innerHTML = sessions.map(session => `
            <tr>
                <td>${session.name}</td>
                <td><span class="session-code">${session.code}</span></td>
                <td>${this.getSubjectName(session.subject)}</td>
                <td>
                    <span class="status-badge ${session.status}">
                        ${this.getStatusText(session.status)}
                    </span>
                </td>
                <td>${session.participants?.length || 0}</td>
                <td>
                    <div class="action-buttons">
                        ${session.status === 'waiting' ? `
                            <button class="btn-icon" onclick="app.startSession('${session._id}')" title="Pornește">
                                <i class="fas fa-play"></i>
                            </button>
                        ` : session.status === 'started' ? `
                            <button class="btn-icon" onclick="app.manageSession('${session._id}')" title="Administrează">
                                <i class="fas fa-cog"></i>
                            </button>
                        ` : ''}
                        <button class="btn-icon" onclick="app.editSession('${session._id}')" title="Editează">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn-icon btn-danger" onclick="app.deleteSession('${session._id}')" title="Șterge">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    renderTeacherStats(stats) {
        document.getElementById('total-sessions').textContent = stats.totalSessions || 0;
        document.getElementById('total-questions').textContent = stats.totalQuestions || 0;
        document.getElementById('total-students').textContent = stats.totalStudents || 0;
        document.getElementById('active-games').textContent = stats.activeGames || 0;
    }

    getSubjectName(subjectCode) {
        const subjects = {
            'istorie': 'Istorie',
            'matematica': 'Matematică',
            'romana': 'Limba Română',
            'geografie': 'Geografie',
            'biologie': 'Biologie',
            'fizica': 'Fizică',
            'chimie': 'Chimie',
            'engleza': 'Engleză',
            'informatica': 'Informatică',
            'franceza': 'Franceză',
            'educatie_fizica': 'Educație Fizică',
            'educatie_plastică': 'Educație Plastică',
            'muzica': 'Muzică'
        };
        return subjects[subjectCode] || subjectCode;
    }

    getStatusText(status) {
        const statusMap = {
            'waiting': 'În așteptare',
            'started': 'În desfășurare',
            'ended': 'Încheiat'
        };
        return statusMap[status] || status;
    }

    initQuestionBuilder() {
        const container = document.getElementById('questions-container');
        container.innerHTML = '';
        
        // Add initial question
        this.addQuestion();
    }

    addQuestion() {
        const container = document.getElementById('questions-container');
        const questionCount = container.children.length + 1;
        const questionId = `question-${Date.now()}`;

        const questionHTML = `
            <div class="question-item" data-id="${questionId}">
                <div class="question-header">
                    <h4>Întrebarea #${questionCount}</h4>
                    <button class="btn-icon btn-danger" onclick="app.removeQuestion('${questionId}')">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="form-group">
                    <label>Textul întrebării</label>
                    <textarea class="question-text" placeholder="Introdu textul întrebării..." rows="3"></textarea>
                </div>
                <div class="answer-options">
                    ${[1, 2, 3, 4].map(num => `
                        <div class="answer-option">
                            <input type="radio" name="${questionId}-correct" value="${num - 1}" ${num === 1 ? 'checked' : ''}>
                            <input type="text" class="answer-text" placeholder="Răspunsul ${String.fromCharCode(64 + num)}" data-index="${num - 1}">
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.insertAdjacentHTML('beforeend', questionHTML);
    }

    removeQuestion(questionId) {
        const questionElement = document.querySelector(`[data-id="${questionId}"]`);
        if (questionElement) {
            questionElement.remove();
            this.renumberQuestions();
        }
    }

    renumberQuestions() {
        const questions = document.querySelectorAll('.question-item');
        questions.forEach((question, index) => {
            const header = question.querySelector('h4');
            if (header) {
                header.textContent = `Întrebarea #${index + 1}`;
            }
        });
    }

    async saveSession() {
        try {
            // Collect session data
            const sessionData = {
                name: document.getElementById('session-name').value,
                subject: document.getElementById('session-subject').value,
                grade: document.getElementById('session-grade').value,
                timePerQuestion: parseInt(document.getElementById('session-time').value) || 20
            };

            // Validate
            if (!sessionData.name || !sessionData.subject) {
                throw new Error('Completează numele și materia sesiunii');
            }

            // Collect questions
            const questions = [];
            const questionElements = document.querySelectorAll('.question-item');
            
            if (questionElements.length < APP_CONFIG.GAME_CONFIG.MIN_QUESTIONS) {
                throw new Error(`Adaugă cel puțin ${APP_CONFIG.GAME_CONFIG.MIN_QUESTIONS} întrebări`);
            }

            questionElements.forEach((element, index) => {
                const text = element.querySelector('.question-text').value;
                const answers = Array.from(element.querySelectorAll('.answer-text')).map(input => input.value);
                const correctAnswer = parseInt(element.querySelector('input[type="radio"]:checked').value);

                if (!text || answers.some(answer => !answer)) {
                    throw new Error(`Completează toate câmpurile pentru întrebarea ${index + 1}`);
                }

                questions.push({
                    text,
                    answers,
                    correctAnswer,
                    order: index
                });
            });

            sessionData.questions = questions;

            // Create session
            const response = await api.createSession(sessionData);
            
            if (response.success) {
                authManager.showToast('Sesiune creată cu succes!', 'success');
                this.showTeacherDashboard();
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Save session error:', error);
            authManager.showToast(error.message, 'error');
        }
    }

    async joinSession() {
        const code = document.getElementById('session-code-input').value;
        
        if (!code || code.length !== 6) {
            authManager.showToast('Introdu un cod valid de 6 caractere', 'error');
            return;
        }

        const result = await gameManager.joinGame(code);
        if (result.success) {
            authManager.showToast('Te-ai alăturat sesiunii cu succes!', 'success');
        } else {
            authManager.showToast(result.error, 'error');
        }
    }

    async startSession(sessionId) {
        try {
            const response = await api.startSession(sessionId);
            if (response.success) {
                authManager.showToast('Sesiunea a început!', 'success');
                // TODO: Show live session screen
            }
        } catch (error) {
            console.error('Start session error:', error);
            authManager.showToast(error.message, 'error');
        }
    }

    async manageSession(sessionId) {
        // TODO: Implement live session management
        console.log('Manage session:', sessionId);
    }

    async editSession(sessionId) {
        try {
            const session = await api.getSession(sessionId);
            // TODO: Implement session editing
            console.log('Edit session:', session);
        } catch (error) {
            console.error('Edit session error:', error);
        }
    }

    async deleteSession(sessionId) {
        if (!confirm('Sigur vrei să ștergi această sesiune?')) return;

        try {
            const response = await api.deleteSession(sessionId);
            if (response.success) {
                authManager.showToast('Sesiune ștearsă cu succes!', 'success');
                this.loadTeacherDashboard();
            }
        } catch (error) {
            console.error('Delete session error:', error);
            authManager.showToast(error.message, 'error');
        }
    }
}

// Initialize application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.app = new Application();
});
