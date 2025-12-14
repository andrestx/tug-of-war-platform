class StudentManager {
    constructor() {
        this.currentSession = null;
        this.currentQuestion = null;
        this.team = null;
        this.score = 0;
        this.correctAnswers = 0;
        this.isConnected = false;
        this.timer = null;
    }

    async initialize() {
        await this.loadStudentData();
        this.setupEventListeners();
    }

    async loadStudentData() {
        try {
            const user = authManager.getUser();
            if (user) {
                // Update UI with user info
                this.updateUserInfo(user);
                
                // Load active games
                await this.loadActiveGames();
                
                // Load game history
                await this.loadGameHistory();
            }
        } catch (error) {
            console.error('Error loading student data:', error);
        }
    }

    updateUserInfo(user) {
        const studentNameElement = document.getElementById('student-name');
        const studentAvatarElement = document.getElementById('student-avatar');
        
        if (studentNameElement) {
            studentNameElement.textContent = user.name;
        }
        
        if (studentAvatarElement) {
            studentAvatarElement.textContent = user.name.charAt(0).toUpperCase();
            studentAvatarElement.style.backgroundColor = this.getRandomColor(user.name);
        }
    }

    getRandomColor(str) {
        // Generate consistent color based on string
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        
        const colors = [
            '#4361ee', '#3a0ca3', '#7209b7', '#f72585',
            '#4cc9f0', '#4895ef', '#560bad', '#b5179e'
        ];
        
        return colors[Math.abs(hash) % colors.length];
    }

    async loadActiveGames() {
        try {
            // Get sessions where user is active participant
            const response = await fetch(`${api.baseUrl}/sessions/active`, {
                headers: {
                    'Authorization': `Bearer ${authManager.getToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderActiveGames(data.sessions);
            }
        } catch (error) {
            console.error('Load active games error:', error);
        }
    }

    async loadGameHistory() {
        try {
            // Get completed sessions
            const response = await fetch(`${api.baseUrl}/sessions/history`, {
                headers: {
                    'Authorization': `Bearer ${authManager.getToken()}`
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                this.renderGameHistory(data.sessions);
            }
        } catch (error) {
            console.error('Load game history error:', error);
        }
    }

    renderActiveGames(sessions) {
        const container = document.getElementById('active-games-list');
        if (!container) return;

        if (!sessions || sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i class="fas fa-gamepad"></i>
                    <p>Nu ai niciun joc activ</p>
                </div>
            `;
            return;
        }

        let html = '';
        sessions.forEach(session => {
            const team = session.participants?.find(p => p.user._id === authManager.user._id)?.team;
            const teamClass = team === 'red' ? 'team-red' : 'team-blue';
            const teamText = team === 'red' ? 'Roșie' : 'Albastră';
            
            html += `
                <div class="game-card" data-session-id="${session._id}">
                    <div class="game-header">
                        <h4>${session.name}</h4>
                        <div class="game-status ${session.status}">
                            ${this.getGameStatusText(session.status)}
                        </div>
                    </div>
                    
                    <div class="game-info">
                        <div class="game-meta">
                            <span class="subject-badge">${this.getSubjectName(session.subject)}</span>
                            <span class="session-code">${session.code}</span>
                        </div>
                        
                        <div class="game-teams">
                            <div class="team-score">
                                <span class="team red">Roșie: ${session.scores?.red || 0}</span>
                                <span class="vs">vs</span>
                                <span class="team blue">Albastră: ${session.scores?.blue || 0}</span>
                            </div>
                            <div class="my-team ${teamClass}">
                                <i class="fas fa-user"></i> Echipa ta: ${teamText}
                            </div>
                        </div>
                    </div>
                    
                    <div class="game-actions">
                        ${session.status === 'started' ? `
                            <button class="btn btn-sm btn-primary join-game">
                                <i class="fas fa-play"></i> Intră în joc
                            </button>
                        ` : session.status === 'waiting' ? `
                            <button class="btn btn-sm btn-secondary copy-code" data-code="${session.code}">
                                <i class="fas fa-copy"></i> Copiază cod
                            </button>
                            <button class="btn btn-sm btn-primary join-game">
                                <i class="fas fa-sign-in-alt"></i> Intră
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    renderGameHistory(sessions) {
        const container = document.getElementById('game-history');
        if (!container) return;

        if (!sessions || sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state-small">
                    <i class="fas fa-history"></i>
                    <p>Nu ai istoric de jocuri</p>
                </div>
            `;
            return;
        }

        let html = '';
        sessions.forEach(session => {
            const participant = session.participants?.find(p => p.user._id === authManager.user._id);
            const team = participant?.team;
            const teamClass = team === 'red' ? 'team-red' : 'team-blue';
            const teamText = team === 'red' ? 'Roșie' : 'Albastră';
            
            // Determine if user's team won
            const userWon = session.scores?.red > session.scores?.blue && team === 'red' ||
                           session.scores?.blue > session.scores?.red && team === 'blue';
            const resultClass = userWon ? 'won' : session.scores?.red === session.scores?.blue ? 'draw' : 'lost';
            const resultText = userWon ? 'Victorie' : session.scores?.red === session.scores?.blue ? 'Remiză' : 'Înfrângere';
            
            html += `
                <div class="history-card" data-session-id="${session._id}">
                    <div class="history-header">
                        <h4>${session.name}</h4>
                        <div class="game-result ${resultClass}">${resultText}</div>
                    </div>
                    
                    <div class="history-info">
                        <div class="history-meta">
                            <span>${this.formatDate(session.endTime)}</span>
                            <span class="subject">${this.getSubjectName(session.subject)}</span>
                        </div>
                        
                        <div class="history-scores">
                            <div class="final-score">
                                <span class="score red">${session.scores?.red || 0}</span>
                                <span class="vs">-</span>
                                <span class="score blue">${session.scores?.blue || 0}</span>
                            </div>
                            <div class="my-performance">
                                <span class="team-badge ${teamClass}">${teamText}</span>
                                <span class="my-score">${participant?.score || 0} puncte</span>
                                <span class="correct-answers">${participant?.correctAnswers || 0}/${session.questions?.length || 0} corecte</span>
                            </div>
                        </div>
                    </div>
                    
                    <div class="history-actions">
                        <button class="btn btn-sm btn-outline-secondary view-details">
                            <i class="fas fa-chart-bar"></i> Detalii
                        </button>
                        <button class="btn btn-sm btn-outline-primary play-again" data-code="${session.code}">
                            <i class="fas fa-redo"></i> Joacă din nou
                        </button>
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    getGameStatusText(status) {
        const statusMap = {
            'waiting': 'În așteptare',
            'started': 'În desfășurare',
            'ended': 'Încheiat'
        };
        return statusMap[status] || status;
    }

    getSubjectName(subjectCode) {
        const subjects = {
            'istorie': 'Istorie',
            'matematica': 'Matematică',
            'romana': 'Română',
            'geografie': 'Geografie',
            'biologie': 'Biologie',
            'fizica': 'Fizică',
            'chimie': 'Chimie',
            'engleza': 'Engleză',
            'informatica': 'Informatică'
        };
        return subjects[subjectCode] || subjectCode;
    }

    formatDate(dateString) {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        return date.toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    setupEventListeners() {
        // Join session button
        document.getElementById('join-session-btn')?.addEventListener('click', () => {
            this.joinSession();
        });

        // Session code input - enter key support
        const sessionCodeInput = document.getElementById('session-code-input');
        if (sessionCodeInput) {
            sessionCodeInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.joinSession();
                }
            });
        }

        // Active games actions
        document.addEventListener('click', (e) => {
            const gameCard = e.target.closest('.game-card');
            if (!gameCard) return;

            const sessionId = gameCard.dataset.sessionId;

            if (e.target.closest('.join-game')) {
                this.joinActiveGame(sessionId);
            } else if (e.target.closest('.copy-code')) {
                const code = e.target.closest('.copy-code').dataset.code;
                this.copySessionCode(code);
            }
        });

        // History actions
        document.addEventListener('click', (e) => {
            const historyCard = e.target.closest('.history-card');
            if (!historyCard) return;

            const sessionId = historyCard.dataset.sessionId;

            if (e.target.closest('.view-details')) {
                this.viewGameDetails(sessionId);
            } else if (e.target.closest('.play-again')) {
                const code = e.target.closest('.play-again').dataset.code;
                this.joinSessionByCode(code);
            }
        });
    }

    async joinSession() {
        const codeInput = document.getElementById('session-code-input');
        if (!codeInput) return;

        const code = codeInput.value.trim().toUpperCase();
        
        if (!code || code.length !== 6) {
            authManager.showToast('Introdu un cod valid de 6 caractere', 'error');
            return;
        }

        await this.joinSessionByCode(code);
    }

    async joinSessionByCode(code) {
        try {
            // First, try to get session info
            const session = await api.getSessionByCode(code);
            
            if (!session) {
                authManager.showToast('Sesiunea nu a fost găsită', 'error');
                return;
            }

            // Check if session is joinable
            if (session.status === 'ended') {
                authManager.showToast('Sesiunea s-a încheiat', 'error');
                return;
            }

            if (session.status === 'draft') {
                authManager.showToast('Sesiunea nu este încă activă', 'error');
                return;
            }

            // Join the session
            const response = await api.joinSession(code);
            
            if (response.success) {
                this.currentSession = response.session;
                this.team = response.team;
                
                // Update UI
                authManager.showToast(`Te-ai alăturat sesiunii! Ești în echipa ${this.team === 'red' ? 'Roșie' : 'Albastră'}`, 'success');
                
                // Enter the game
                await this.enterGame();
            } else {
                authManager.showToast(response.error || 'Eroare la alăturarea la sesiune', 'error');
            }
        } catch (error) {
            console.error('Join session error:', error);
            authManager.showToast('Eroare la conectarea la sesiune', 'error');
        }
    }

    async joinActiveGame(sessionId) {
        try {
            // Get session details
            const session = await api.getSession(sessionId);
            this.currentSession = session;
            
            // Find which team the user is on
            const participant = session.participants?.find(p => p.user._id === authManager.user._id);
            if (participant) {
                this.team = participant.team;
                this.score = participant.score || 0;
                this.correctAnswers = participant.correctAnswers || 0;
            }
            
            // Enter the game
            await this.enterGame();
        } catch (error) {
            console.error('Join active game error:', error);
            authManager.showToast('Eroare la intrarea în joc', 'error');
        }
    }

    async enterGame() {
        if (!this.currentSession) return;

        // Connect to socket
        if (!api.socket || !api.socket.connected) {
            api.connectSocket();
        }

        api.joinSessionRoom(this.currentSession._id);
        
        // Setup game listeners
        this.setupGameListeners();

        // Show game screen
        this.showGameScreen();
    }

    setupGameListeners() {
        if (!this.currentSession) return;

        const sessionId = this.currentSession._id;

        // Listen for session updates
        api.onSessionUpdate(sessionId, (data) => {
            this.handleSessionUpdate(data);
        });

        // Listen for question updates
        api.onQuestionUpdate(sessionId, (question) => {
            this.handleQuestionUpdate(question);
        });

        // Listen for score updates
        api.onScoreUpdate(sessionId, (scores) => {
            this.handleScoreUpdate(scores);
        });

        // Listen for game events
        api.socket.on(`game-event-${sessionId}`, (event) => {
            this.handleGameEvent(event);
        });

        // Listen for answer feedback
        api.socket.on(`answer-feedback-${sessionId}`, (feedback) => {
            this.handleAnswerFeedback(feedback);
        });
    }

    handleSessionUpdate(data) {
        if (data.status === 'ended') {
            this.handleGameEnd();
        }
    }

    handleQuestionUpdate(question) {
        this.currentQuestion = question;
        this.showQuestion(question);
        this.startQuestionTimer();
    }

    handleScoreUpdate(scores) {
        // Update scores display
        document.getElementById('student-red-score').textContent = scores.red || 0;
        document.getElementById('student-blue-score').textContent = scores.blue || 0;
        document.getElementById('student-rope-center').textContent = `${scores.red || 0}-${scores.blue || 0}`;

        // Update tug visualization
        this.updateTugVisualization(scores);
    }

    handleGameEvent(event) {
        switch (event.type) {
            case 'game_started':
                authManager.showToast('Jocul a început!', 'success');
                break;
            case 'game_paused':
                authManager.showToast('Jocul este în pauză', 'warning');
                break;
            case 'participant_joined':
                authManager.showToast('Un nou participant s-a alăturat', 'info');
                break;
            case 'participant_left':
                authManager.showToast('Un participant a părăsit jocul', 'info');
                break;
        }
    }

    handleAnswerFeedback(feedback) {
        if (feedback.userId === authManager.user._id) {
            if (feedback.isCorrect) {
                authManager.showToast('Răspuns corect! +1 punct', 'success');
                this.score++;
                this.correctAnswers++;
                this.updatePlayerStats();
            } else {
                authManager.showToast('Răspuns incorect', 'error');
            }
        }
    }

    handleGameEnd() {
        // Stop timer
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Show game over screen
        this.showGameOverScreen();
    }

    showGameScreen() {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Create game screen
        const gameContainer = document.getElementById('game-container');
        gameContainer.innerHTML = this.createGameTemplate();
        
        // Show game screen
        document.getElementById('game-screen').classList.add('active');

        // Update team display
        this.updateTeamDisplay();
    }

    createGameTemplate() {
        const session = this.currentSession;
        const redScore = session.scores?.red || 0;
        const blueScore = session.scores?.blue || 0;
        
        return `
            <div class="student-game-view">
                <div class="game-header">
                    <div class="session-info">
                        <h2>${session.name}</h2>
                        <div class="session-meta">
                            <span class="session-code">${session.code}</span>
                            <span class="status-badge started">În desfășurare</span>
                        </div>
                    </div>
                    <div class="player-info">
                        <div class="player-team ${this.team}">
                            <i class="fas fa-user"></i>
                            <span>${this.team === 'red' ? 'Roșie' : 'Albastră'}</span>
                        </div>
                        <div class="player-score">
                            <i class="fas fa-star"></i>
                            <span>${this.score} puncte</span>
                        </div>
                    </div>
                </div>

                <div class="game-content">
                    <!-- Tug of War Visualization -->
                    <div class="tug-of-war-game">
                        <div class="teams-scoreboard">
                            <div class="team-score-display red">
                                <div class="team-name">Echipa Roșie</div>
                                <div class="team-score" id="red-score-game">${redScore}</div>
                            </div>
                            
                            <div class="tug-visualization-game">
                                <div class="rope"></div>
                                <div class="rope-center" id="rope-center-game">${redScore}-${blueScore}</div>
                                <div class="pullers">
                                    <div class="puller puller-red" id="puller-red-game"></div>
                                    <div class="puller puller-blue" id="puller-blue-game"></div>
                                </div>
                            </div>
                            
                            <div class="team-score-display blue">
                                <div class="team-name">Echipa Albastră</div>
                                <div class="team-score" id="blue-score-game">${blueScore}</div>
                            </div>
                        </div>

                        <!-- Current Question -->
                        <div class="question-container" id="question-container">
                            ${this.currentQuestion ? this.createQuestionTemplate(this.currentQuestion) : `
                                <div class="waiting-for-question">
                                    <i class="fas fa-hourglass-half"></i>
                                    <h3>Așteaptă următoarea întrebare...</h3>
                                    <p>Profesorul va începe jocul în curând</p>
                                </div>
                            `}
                        </div>

                        <!-- Game Stats -->
                        <div class="game-stats">
                            <div class="stat-item">
                                <div class="stat-label">Scorul tău</div>
                                <div class="stat-value" id="player-score-display">${this.score}</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Răspunsuri corecte</div>
                                <div class="stat-value" id="player-correct-display">${this.correctAnswers}</div>
                            </div>
                            <div class="stat-item">
                                <div class="stat-label">Pozitie clasament</div>
                                <div class="stat-value" id="player-rank">#-</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="game-footer">
                    <button class="btn btn-secondary" id="leave-game">
                        <i class="fas fa-sign-out-alt"></i> Părăsește jocul
                    </button>
                    <div class="game-timer">
                        <i class="fas fa-clock"></i>
                        <span id="global-timer">00:00</span>
                    </div>
                </div>
            </div>
        `;
    }

    createQuestionTemplate(question) {
        return `
            <div class="question-display-game">
                <div class="question-header">
                    <h3>Întrebare</h3>
                    <div class="question-timer" id="question-timer-game">
                        <i class="fas fa-clock"></i>
                        <span>${this.currentSession?.settings?.timePerQuestion || 20}</span>
                    </div>
                </div>
                
                <div class="question-text">${question.text}</div>
                
                <div class="answers-grid-game">
                    ${question.answers.map((answer, index) => `
                        <button class="answer-btn-game" data-index="${index}" onclick="studentManager.submitAnswer(${index})">
                            <div class="answer-letter">${String.fromCharCode(65 + index)}</div>
                            <div class="answer-text">${answer}</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    updateTeamDisplay() {
        const teamBadge = document.querySelector('.player-team');
        if (teamBadge) {
            teamBadge.style.backgroundColor = this.team === 'red' ? 'var(--team-red)' : 'var(--team-blue)';
            teamBadge.style.color = 'white';
        }
    }

    showQuestion(question) {
        const container = document.getElementById('question-container');
        if (!container) return;

        container.innerHTML = this.createQuestionTemplate(question);
        
        // Reset answer buttons
        this.resetAnswerButtons();
    }

    startQuestionTimer() {
        const timePerQuestion = this.currentSession?.settings?.timePerQuestion || 20;
        let timeLeft = timePerQuestion;
        
        const timerElement = document.getElementById('question-timer-game');
        if (!timerElement) return;

        // Clear existing timer
        if (this.timer) {
            clearInterval(this.timer);
        }

        // Start new timer
        this.timer = setInterval(() => {
            timeLeft--;
            
            const timerSpan = timerElement.querySelector('span');
            if (timerSpan) {
                timerSpan.textContent = timeLeft;
            }

            // Update timer color when time is running out
            if (timeLeft <= 10) {
                timerElement.style.color = 'var(--danger-color)';
            }

            if (timeLeft <= 0) {
                clearInterval(this.timer);
                this.handleTimeUp();
            }
        }, 1000);
    }

    async submitAnswer(answerIndex) {
        if (!this.currentSession || !this.currentQuestion) return;

        try {
            const response = await api.submitAnswer(
                this.currentSession._id,
                this.currentQuestion._id,
                answerIndex
            );

            if (response.success) {
                // Disable all answer buttons
                this.disableAnswerButtons();
                
                // Highlight selected answer
                this.highlightAnswer(answerIndex, response.isCorrect);
                
                // Update player stats
                if (response.isCorrect) {
                    this.score += response.points;
                    this.correctAnswers++;
                    this.updatePlayerStats();
                }
            }
        } catch (error) {
            console.error('Submit answer error:', error);
            authManager.showToast('Eroare la trimiterea răspunsului', 'error');
        }
    }

    highlightAnswer(answerIndex, isCorrect) {
        const buttons = document.querySelectorAll('.answer-btn-game');
        buttons.forEach(button => {
            button.disabled = true;
            
            if (parseInt(button.dataset.index) === answerIndex) {
                button.classList.add(isCorrect ? 'correct' : 'incorrect');
            }
        });
    }

    disableAnswerButtons() {
        const buttons = document.querySelectorAll('.answer-btn-game');
        buttons.forEach(button => {
            button.disabled = true;
        });
    }

    resetAnswerButtons() {
        const buttons = document.querySelectorAll('.answer-btn-game');
        buttons.forEach(button => {
            button.disabled = false;
            button.classList.remove('correct', 'incorrect');
        });
    }

    handleTimeUp() {
        // Disable answer buttons when time is up
        this.disableAnswerButtons();
        
        // Show time up message
        authManager.showToast('Timpul pentru această întrebare s-a scurs', 'warning');
    }

    updateTugVisualization(scores) {
        const totalScore = (scores.red || 0) + (scores.blue || 0);
        if (totalScore === 0) return;

        const redPercentage = (scores.red || 0) / totalScore;
        const ropePosition = 50 + (redPercentage - 0.5) * 40;

        const ropeCenter = document.getElementById('rope-center-game');
        const pullerRed = document.getElementById('puller-red-game');
        const pullerBlue = document.getElementById('puller-blue-game');

        if (ropeCenter) {
            ropeCenter.style.left = `${ropePosition}%`;
        }

        if (pullerRed) {
            pullerRed.style.left = `${Math.max(10, ropePosition - 15)}%`;
        }

        if (pullerBlue) {
            pullerBlue.style.right = `${Math.max(10, 100 - ropePosition - 15)}%`;
        }
    }

    updatePlayerStats() {
        document.getElementById('player-score-display').textContent = this.score;
        document.getElementById('player-correct-display').textContent = this.correctAnswers;
        
        // Update player score in header
        const playerScoreElement = document.querySelector('.player-score span');
        if (playerScoreElement) {
            playerScoreElement.textContent = `${this.score} puncte`;
        }
    }

    showGameOverScreen() {
        // Show game over modal
        this.showGameOverModal();
    }

    async showGameOverModal() {
        try {
            // Get final leaderboard
            const leaderboard = await api.getLeaderboard(this.currentSession._id);
            
            // Find player's rank
            const playerRank = leaderboard.findIndex(p => p.userId === authManager.user._id) + 1;
            
            // Determine if player's team won
            const userWon = this.currentSession.scores?.red > this.currentSession.scores?.blue && this.team === 'red' ||
                           this.currentSession.scores?.blue > this.currentSession.scores?.red && this.team === 'blue';
            
            const modalContent = `
                <div class="game-over-modal">
                    <div class="game-over-header ${userWon ? 'victory' : 'defeat'}">
                        <i class="fas fa-${userWon ? 'trophy' : 'flag'}"></i>
                        <h2>${userWon ? 'VICTORIE!' : 'JOC TERMINAT'}</h2>
                    </div>
                    
                    <div class="final-results">
                        <div class="team-results">
                            <div class="team-result red">
                                <h3>Echipa Roșie</h3>
                                <div class="final-score">${this.currentSession.scores?.red || 0}</div>
                            </div>
                            <div class="vs">VS</div>
                            <div class="team-result blue">
                                <h3>Echipa Albastră</h3>
                                <div class="final-score">${this.currentSession.scores?.blue || 0}</div>
                            </div>
                        </div>
                        
                        <div class="player-performance">
                            <h3>Performanța ta</h3>
                            <div class="performance-stats">
                                <div class="stat">
                                    <div class="stat-label">Scor final</div>
                                    <div class="stat-value">${this.score} puncte</div>
                                </div>
                                <div class="stat">
                                    <div class="stat-label">Răspunsuri corecte</div>
                                    <div class="stat-value">${this.correctAnswers}/${this.currentSession.questions?.length || 0}</div>
                                </div>
                                <div class="stat">
                                    <div class="stat-label">Pozitie clasament</div>
                                    <div class="stat-value">#${playerRank}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="game-over-actions">
                        <button class="btn btn-primary" onclick="studentManager.returnToDashboard()">
                            <i class="fas fa-home"></i> Înapoi la dashboard
                        </button>
                        <button class="btn btn-secondary" onclick="studentManager.playAgain()">
                            <i class="fas fa-redo"></i> Joacă din nou
                        </button>
                    </div>
                </div>
            `;

            this.showModal(modalContent);
        } catch (error) {
            console.error('Show game over error:', error);
        }
    }

    showModal(content) {
        const modal = document.getElementById('session-modal');
        const modalContent = document.getElementById('modal-content');
        
        modalContent.innerHTML = content;
        modal.classList.add('active');
    }

    closeModal() {
        const modal = document.getElementById('session-modal');
        modal.classList.remove('active');
    }

    returnToDashboard() {
        this.cleanup();
        this.closeModal();
        window.location.hash = 'student-dashboard';
    }

    playAgain() {
        this.closeModal();
        this.returnToDashboard();
        // Auto-focus on session code input
        const codeInput = document.getElementById('session-code-input');
        if (codeInput) {
            codeInput.focus();
        }
    }

    copySessionCode(code) {
        navigator.clipboard.writeText(code)
            .then(() => {
                authManager.showToast('Codul a fost copiat!', 'success');
            })
            .catch(() => {
                authManager.showToast('Nu s-a putut copia codul', 'error');
            });
    }

    async viewGameDetails(sessionId) {
        try {
            const session = await api.getSession(sessionId);
            const leaderboard = await api.getLeaderboard(sessionId);
            
            this.showGameDetailsModal(session, leaderboard);
        } catch (error) {
            console.error('View game details error:', error);
            authManager.showToast('Eroare la încărcarea detaliilor jocului', 'error');
        }
    }

    showGameDetailsModal(session, leaderboard) {
        const participant = session.participants?.find(p => p.user._id === authManager.user._id);
        const playerRank = leaderboard.findIndex(p => p.userId === authManager.user._id) + 1;
        
        const modalContent = `
            <div class="game-details-modal">
                <h2>${session.name} - Detalii</h2>
                
                <div class="game-summary">
                    <div class="summary-item">
                        <div class="summary-label">Data</div>
                        <div class="summary-value">${this.formatDate(session.endTime)}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Materie</div>
                        <div class="summary-value">${this.getSubjectName(session.subject)}</div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-label">Cod sesiune</div>
                        <div class="summary-value">${session.code}</div>
                    </div>
                </div>
                
                <div class="final-scores-details">
                    <h3>Rezultat final</h3>
                    <div class="score-display">
                        <div class="team-score-large red">
                            <div class="team-name">Roșie</div>
                            <div class="score">${session.scores?.red || 0}</div>
                        </div>
                        <div class="score-separator">:</div>
                        <div class="team-score-large blue">
                            <div class="team-name">Albastră</div>
                            <div class="score">${session.scores?.blue || 0}</div>
                        </div>
                    </div>
                </div>
                
                <div class="player-performance-details">
                    <h3>Performanța ta</h3>
                    <div class="performance-grid">
                        <div class="perf-item">
                            <div class="perf-label">Scor</div>
                            <div class="perf-value">${participant?.score || 0} puncte</div>
                        </div>
                        <div class="perf-item">
                            <div class="perf-label">Corecte</div>
                            <div class="perf-value">${participant?.correctAnswers || 0}/${session.questions?.length || 0}</div>
                        </div>
                        <div class="perf-item">
                            <div class="perf-label">Precizie</div>
                            <div class="perf-value">${session.questions?.length ? Math.round((participant?.correctAnswers || 0) / session.questions.length * 100) : 0}%</div>
                        </div>
                        <div class="perf-item">
                            <div class="perf-label">Pozitie</div>
                            <div class="perf-value">#${playerRank}</div>
                        </div>
                    </div>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="studentManager.closeModal()">Închide</button>
                </div>
            </div>
        `;

        this.showModal(modalContent);
    }

    cleanup() {
        // Clear timer
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }

        // Disconnect from socket
        if (this.currentSession) {
            api.leaveSessionRoom(this.currentSession._id);
            api.removeSessionListeners(this.currentSession._id);
        }

        // Reset game state
        this.currentSession = null;
        this.currentQuestion = null;
        this.team = null;
        this.score = 0;
        this.correctAnswers = 0;
        this.isConnected = false;
    }

    // Leave game button handler
    setupLeaveGameButton() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('#leave-game')) {
                this.leaveGame();
            }
        });
    }

    leaveGame() {
        const result = confirm('Sigur vrei să părăsești jocul? Poți reveni mai târziu.');
        if (!result) return;

        this.cleanup();
        window.location.hash = 'student-dashboard';
    }
}

// Initialize Student Manager
window.studentManager = new StudentManager();

// Add event listener for when student dashboard loads
document.addEventListener('DOMContentLoaded', () => {
    // Initialize leave game button handler
    window.studentManager.setupLeaveGameButton();
});
