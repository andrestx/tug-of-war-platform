class TeacherManager {
    constructor() {
        this.currentSession = null;
        this.questions = [];
        this.participants = [];
        this.socketConnected = false;
    }

    async initialize() {
        await this.loadTeacherData();
        this.setupEventListeners();
    }

    async loadTeacherData() {
        try {
            const [sessions, stats] = await Promise.all([
                api.getSessions(),
                api.getUserStats()
            ]);

            this.renderDashboard(sessions, stats);
        } catch (error) {
            console.error('Error loading teacher data:', error);
            authManager.showToast('Eroare la încărcarea datelor', 'error');
        }
    }

    renderDashboard(sessions, stats) {
        // Render sessions table
        this.renderSessionsTable(sessions);
        
        // Render statistics
        this.renderStatistics(stats);
        
        // Set up session actions
        this.setupSessionActions();
    }

    renderSessionsTable(sessions) {
        const container = document.getElementById('sessions-container');
        if (!container) return;

        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-chalkboard-teacher"></i>
                    <h3>Nu ai nicio sesiune</h3>
                    <p>Creează prima ta sesiune pentru a începe să joci cu elevii tăi!</p>
                    <button class="btn btn-primary" id="create-first-session">
                        <i class="fas fa-plus"></i> Creează prima sesiune
                    </button>
                </div>
            `;
            return;
        }

        let html = '<div class="sessions-grid">';
        
        sessions.forEach(session => {
            const statusClass = this.getStatusClass(session.status);
            const statusText = this.getStatusText(session.status);
            const participantCount = session.participants?.length || 0;
            const questionCount = session.questions?.length || 0;
            
            html += `
                <div class="session-card" data-session-id="${session._id}">
                    <div class="session-header">
                        <div class="session-code-badge">${session.code}</div>
                        <div class="session-status ${statusClass}">${statusText}</div>
                    </div>
                    
                    <div class="session-content">
                        <h4 class="session-title">${session.name}</h4>
                        <p class="session-subject">${this.getSubjectName(session.subject)}</p>
                        
                        <div class="session-stats">
                            <div class="stat">
                                <i class="fas fa-users"></i>
                                <span>${participantCount} participanți</span>
                            </div>
                            <div class="stat">
                                <i class="fas fa-question-circle"></i>
                                <span>${questionCount} întrebări</span>
                            </div>
                        </div>
                        
                        <div class="session-meta">
                            <span><i class="fas fa-calendar"></i> ${this.formatDate(session.createdAt)}</span>
                        </div>
                    </div>
                    
                    <div class="session-actions">
                        ${session.status === 'draft' ? `
                            <button class="btn btn-sm btn-primary edit-session">
                                <i class="fas fa-edit"></i> Editează
                            </button>
                            <button class="btn btn-sm btn-success start-session">
                                <i class="fas fa-play"></i> Pornește
                            </button>
                        ` : session.status === 'waiting' ? `
                            <button class="btn btn-sm btn-success start-session">
                                <i class="fas fa-play"></i> Pornește
                            </button>
                            <button class="btn btn-sm btn-secondary copy-code" data-code="${session.code}">
                                <i class="fas fa-copy"></i> Cod
                            </button>
                        ` : session.status === 'started' ? `
                            <button class="btn btn-sm btn-warning manage-session">
                                <i class="fas fa-cog"></i> Administrează
                            </button>
                            <button class="btn btn-sm btn-danger end-session">
                                <i class="fas fa-stop"></i> Încheie
                            </button>
                        ` : session.status === 'ended' ? `
                            <button class="btn btn-sm btn-secondary view-results">
                                <i class="fas fa-chart-bar"></i> Rezultate
                            </button>
                            <button class="btn btn-sm btn-primary restart-session">
                                <i class="fas fa-redo"></i> Restartează
                            </button>
                        ` : ''}
                        
                        <button class="btn btn-sm btn-outline-danger delete-session">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    renderStatistics(stats) {
        document.getElementById('total-sessions').textContent = stats.totalSessions || 0;
        document.getElementById('total-questions').textContent = stats.totalQuestions || 0;
        document.getElementById('total-students').textContent = stats.totalStudents || 0;
        document.getElementById('active-games').textContent = stats.activeGames || 0;
    }

    getStatusClass(status) {
        const statusClasses = {
            'draft': 'draft',
            'waiting': 'waiting',
            'started': 'started',
            'ended': 'ended'
        };
        return statusClasses[status] || 'draft';
    }

    getStatusText(status) {
        const statusTexts = {
            'draft': 'Ciornă',
            'waiting': 'În așteptare',
            'started': 'În desfășurare',
            'ended': 'Încheiat'
        };
        return statusTexts[status] || status;
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
            'muzica': 'Muzică',
            'other': 'Altă materie'
        };
        return subjects[subjectCode] || subjectCode;
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        return date.toLocaleDateString('ro-RO', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
    }

    setupEventListeners() {
        // Session card actions
        document.addEventListener('click', (e) => {
            const sessionCard = e.target.closest('.session-card');
            if (!sessionCard) return;

            const sessionId = sessionCard.dataset.sessionId;

            if (e.target.closest('.start-session')) {
                this.startSession(sessionId);
            } else if (e.target.closest('.manage-session')) {
                this.manageSession(sessionId);
            } else if (e.target.closest('.end-session')) {
                this.endSession(sessionId);
            } else if (e.target.closest('.edit-session')) {
                this.editSession(sessionId);
            } else if (e.target.closest('.view-results')) {
                this.viewResults(sessionId);
            } else if (e.target.closest('.restart-session')) {
                this.restartSession(sessionId);
            } else if (e.target.closest('.delete-session')) {
                this.deleteSession(sessionId);
            } else if (e.target.closest('.copy-code')) {
                const code = e.target.closest('.copy-code').dataset.code;
                this.copySessionCode(code);
            }
        });

        // Create session button
        document.getElementById('create-session-btn')?.addEventListener('click', () => {
            this.showCreateSessionScreen();
        });

        document.getElementById('create-first-session')?.addEventListener('click', () => {
            this.showCreateSessionScreen();
        });

        // Back button
        document.getElementById('back-to-dashboard')?.addEventListener('click', () => {
            this.showDashboard();
        });
    }

    async startSession(sessionId) {
        try {
            const result = confirm('Sigur vrei să pornești această sesiune? Elevii se vor putea alătura și vei începe jocul.');
            if (!result) return;

            const response = await api.startSession(sessionId);
            
            if (response.success) {
                authManager.showToast('Sesiunea a început!', 'success');
                await this.loadTeacherData();
                
                // Connect to socket and manage session
                await this.manageSession(sessionId);
            }
        } catch (error) {
            console.error('Start session error:', error);
            authManager.showToast(error.message || 'Eroare la pornirea sesiunii', 'error');
        }
    }

    async manageSession(sessionId) {
        try {
            // Get session details
            const session = await api.getSession(sessionId);
            this.currentSession = session;
            
            // Show live session view
            this.showLiveSessionView(session);
            
            // Connect to socket
            this.connectToSessionSocket(sessionId);
        } catch (error) {
            console.error('Manage session error:', error);
            authManager.showToast('Eroare la încărcarea sesiunii', 'error');
        }
    }

    showLiveSessionView(session) {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Create live session view
        const liveSessionContainer = document.getElementById('live-session-screen');
        liveSessionContainer.innerHTML = this.createLiveSessionTemplate(session);
        liveSessionContainer.classList.add('active');

        // Initialize live session controls
        this.initializeLiveSessionControls();
    }

    createLiveSessionTemplate(session) {
        const participantCount = session.participants?.length || 0;
        const redTeam = session.participants?.filter(p => p.team === 'red') || [];
        const blueTeam = session.participants?.filter(p => p.team === 'blue') || [];
        
        return `
            <div class="live-session-view">
                <div class="session-header-bar">
                    <button class="btn btn-secondary" id="back-to-dashboard-live">
                        <i class="fas fa-arrow-left"></i> Înapoi
                    </button>
                    <div class="session-info">
                        <h2>${session.name}</h2>
                        <div class="session-meta">
                            <span class="session-code">${session.code}</span>
                            <span class="status-badge started">În desfășurare</span>
                            <span><i class="fas fa-users"></i> ${participantCount} participanți</span>
                        </div>
                    </div>
                    <div class="session-controls">
                        <button class="btn btn-danger" id="end-session-live">
                            <i class="fas fa-stop"></i> Încheie sesiunea
                        </button>
                    </div>
                </div>

                <div class="live-content">
                    <!-- Game View -->
                    <div class="game-view">
                        <div class="teams-display">
                            <div class="team-card team-red">
                                <div class="team-header">
                                    <h3>Echipa Roșie</h3>
                                    <div class="team-score" id="red-score-live">${session.scores?.red || 0}</div>
                                </div>
                                <div class="team-participants">
                                    <h4>Participanți (${redTeam.length})</h4>
                                    <div class="participants-list" id="red-team-list">
                                        ${redTeam.map(p => `
                                            <div class="participant-item">
                                                <div class="participant-info">
                                                    <div class="participant-avatar">${p.user?.name?.charAt(0) || 'U'}</div>
                                                    <span class="participant-name">${p.user?.name || 'Utilizator'}</span>
                                                </div>
                                                <div class="participant-stats">
                                                    <span class="score">${p.score || 0} puncte</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>

                            <div class="tug-visualization-live">
                                <div class="rope"></div>
                                <div class="rope-center" id="rope-center-live">
                                    ${session.scores?.red || 0}-${session.scores?.blue || 0}
                                </div>
                                <div class="pullers">
                                    <div class="puller puller-red" id="puller-red-live"></div>
                                    <div class="puller puller-blue" id="puller-blue-live"></div>
                                </div>
                            </div>

                            <div class="team-card team-blue">
                                <div class="team-header">
                                    <h3>Echipa Albastră</h3>
                                    <div class="team-score" id="blue-score-live">${session.scores?.blue || 0}</div>
                                </div>
                                <div class="team-participants">
                                    <h4>Participanți (${blueTeam.length})</h4>
                                    <div class="participants-list" id="blue-team-list">
                                        ${blueTeam.map(p => `
                                            <div class="participant-item">
                                                <div class="participant-info">
                                                    <div class="participant-avatar">${p.user?.name?.charAt(0) || 'U'}</div>
                                                    <span class="participant-name">${p.user?.name || 'Utilizator'}</span>
                                                </div>
                                                <div class="participant-stats">
                                                    <span class="score">${p.score || 0} puncte</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Current Question -->
                        <div class="current-question" id="current-question-container">
                            ${session.currentQuestion ? `
                                <div class="question-display-live">
                                    <h3>Întrebarea curentă</h3>
                                    <div class="question-text">${session.currentQuestion.text}</div>
                                    <div class="answers-stats">
                                        ${session.currentQuestion.answers.map((answer, index) => `
                                            <div class="answer-stat">
                                                <div class="answer-letter">${String.fromCharCode(65 + index)}</div>
                                                <div class="answer-text">${answer}</div>
                                                <div class="answer-progress">
                                                    <div class="progress-bar">
                                                        <div class="progress-fill" style="width: 0%"></div>
                                                    </div>
                                                    <span class="percentage">0%</span>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="question-timer">
                                        <i class="fas fa-clock"></i>
                                        <span id="question-timer-live">${session.settings?.timePerQuestion || 20}</span> secunde rămase
                                    </div>
                                </div>
                            ` : `
                                <div class="no-question">
                                    <i class="fas fa-question-circle"></i>
                                    <p>Nicio întrebare activă momentan</p>
                                </div>
                            `}
                        </div>
                    </div>

                    <!-- Controls Sidebar -->
                    <div class="controls-sidebar">
                        <div class="control-section">
                            <h3><i class="fas fa-cog"></i> Control</h3>
                            <div class="control-buttons">
                                <button class="btn btn-primary btn-block" id="next-question-live">
                                    <i class="fas fa-forward"></i> Următoarea întrebare
                                </button>
                                <button class="btn btn-secondary btn-block" id="pause-session">
                                    <i class="fas fa-pause"></i> Pauză
                                </button>
                                <button class="btn btn-warning btn-block" id="show-leaderboard">
                                    <i class="fas fa-trophy"></i> Clasament
                                </button>
                            </div>
                        </div>

                        <div class="control-section">
                            <h3><i class="fas fa-user-friends"></i> Participanți</h3>
                            <div class="participants-control">
                                <div class="search-box">
                                    <input type="text" placeholder="Caută participant..." id="search-participant">
                                </div>
                                <div class="participants-list-scrollable" id="all-participants-list">
                                    ${session.participants?.map(p => `
                                        <div class="participant-item-control" data-user-id="${p.user._id}">
                                            <div class="participant-info">
                                                <div class="participant-avatar ${p.team}">${p.user?.name?.charAt(0) || 'U'}</div>
                                                <div>
                                                    <div class="participant-name">${p.user?.name || 'Utilizator'}</div>
                                                    <div class="participant-team ${p.team}">${p.team === 'red' ? 'Roșie' : 'Albastră'}</div>
                                                </div>
                                            </div>
                                            <div class="participant-actions">
                                                <button class="btn-icon btn-danger kick-participant" title="Elimină">
                                                    <i class="fas fa-user-slash"></i>
                                                </button>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>

                        <div class="control-section">
                            <h3><i class="fas fa-chart-bar"></i> Statistici</h3>
                            <div class="session-stats-live">
                                <div class="stat-item">
                                    <div class="stat-label">Întrebări rămase</div>
                                    <div class="stat-value" id="questions-remaining">${session.questions?.length || 0}</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">Timp mediu răspuns</div>
                                    <div class="stat-value" id="avg-response-time">0s</div>
                                </div>
                                <div class="stat-item">
                                    <div class="stat-label">Acuratețe totală</div>
                                    <div class="stat-value" id="total-accuracy">0%</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    initializeLiveSessionControls() {
        // Back button
        document.getElementById('back-to-dashboard-live')?.addEventListener('click', () => {
            this.showDashboard();
        });

        // End session button
        document.getElementById('end-session-live')?.addEventListener('click', () => {
            if (this.currentSession) {
                this.endSession(this.currentSession._id);
            }
        });

        // Next question button
        document.getElementById('next-question-live')?.addEventListener('click', async () => {
            if (this.currentSession) {
                try {
                    await api.nextQuestion(this.currentSession._id);
                    authManager.showToast('Următoarea întrebare a fost încărcată', 'success');
                } catch (error) {
                    console.error('Next question error:', error);
                    authManager.showToast('Eroare la încărcarea următoarei întrebări', 'error');
                }
            }
        });

        // Kick participant buttons
        document.addEventListener('click', (e) => {
            if (e.target.closest('.kick-participant')) {
                const participantItem = e.target.closest('.participant-item-control');
                const userId = participantItem.dataset.userId;
                this.kickParticipant(userId);
            }
        });

        // Search participants
        const searchInput = document.getElementById('search-participant');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterParticipants(e.target.value);
            });
        }
    }

    connectToSessionSocket(sessionId) {
        if (!api.socket) {
            api.connectSocket();
        }

        api.joinSessionRoom(sessionId);

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

        // Listen for participant updates
        api.socket.on(`participant-update-${sessionId}`, (data) => {
            this.handleParticipantUpdate(data);
        });

        // Listen for answer results
        api.socket.on(`answer-result-${sessionId}`, (data) => {
            this.handleAnswerResult(data);
        });
    }

    handleSessionUpdate(data) {
        if (data.status === 'ended') {
            authManager.showToast('Sesiunea s-a încheiat', 'info');
            this.showDashboard();
        }
    }

    handleQuestionUpdate(question) {
        const container = document.getElementById('current-question-container');
        if (!container) return;

        container.innerHTML = `
            <div class="question-display-live">
                <h3>Întrebarea curentă</h3>
                <div class="question-text">${question.text}</div>
                <div class="answers-stats">
                    ${question.answers.map((answer, index) => `
                        <div class="answer-stat" data-index="${index}">
                            <div class="answer-letter">${String.fromCharCode(65 + index)}</div>
                            <div class="answer-text">${answer}</div>
                            <div class="answer-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: 0%"></div>
                                </div>
                                <span class="percentage">0%</span>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div class="question-timer">
                    <i class="fas fa-clock"></i>
                    <span id="question-timer-live">${this.currentSession?.settings?.timePerQuestion || 20}</span> secunde rămase
                </div>
            </div>
        `;

        // Start timer
        this.startQuestionTimer();
    }

    handleScoreUpdate(scores) {
        // Update scores display
        document.getElementById('red-score-live').textContent = scores.red || 0;
        document.getElementById('blue-score-live').textContent = scores.blue || 0;
        document.getElementById('rope-center-live').textContent = `${scores.red || 0}-${scores.blue || 0}`;

        // Update tug visualization
        this.updateTugVisualization(scores);
    }

    handleParticipantUpdate(data) {
        // Update participants list
        if (data.action === 'joined') {
            this.addParticipantToList(data.user);
        } else if (data.action === 'left') {
            this.removeParticipantFromList(data.userId);
        } else if (data.action === 'kicked') {
            this.removeParticipantFromList(data.userId);
        }
    }

    handleAnswerResult(data) {
        // Update answer statistics
        const answerStat = document.querySelector(`.answer-stat[data-index="${data.answerIndex}"]`);
        if (answerStat) {
            const progressFill = answerStat.querySelector('.progress-fill');
            const percentageSpan = answerStat.querySelector('.percentage');
            
            // For demo purposes, increment by 25%
            const currentWidth = parseInt(progressFill.style.width) || 0;
            const newWidth = Math.min(currentWidth + 25, 100);
            
            progressFill.style.width = `${newWidth}%`;
            percentageSpan.textContent = `${newWidth}%`;
        }
    }

    startQuestionTimer() {
        let timeLeft = this.currentSession?.settings?.timePerQuestion || 20;
        const timerElement = document.getElementById('question-timer-live');
        
        const timer = setInterval(() => {
            timeLeft--;
            if (timerElement) {
                timerElement.textContent = timeLeft;
            }
            
            if (timeLeft <= 0) {
                clearInterval(timer);
            }
        }, 1000);
    }

    updateTugVisualization(scores) {
        const totalScore = (scores.red || 0) + (scores.blue || 0);
        if (totalScore === 0) return;

        const redPercentage = (scores.red || 0) / totalScore;
        const ropePosition = 50 + (redPercentage - 0.5) * 40;

        const ropeCenter = document.getElementById('rope-center-live');
        const pullerRed = document.getElementById('puller-red-live');
        const pullerBlue = document.getElementById('puller-blue-live');

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

    addParticipantToList(user) {
        const participantsList = document.getElementById('all-participants-list');
        if (!participantsList) return;

        const participantHTML = `
            <div class="participant-item-control" data-user-id="${user._id}">
                <div class="participant-info">
                    <div class="participant-avatar">${user.name?.charAt(0) || 'U'}</div>
                    <div>
                        <div class="participant-name">${user.name || 'Utilizator'}</div>
                        <div class="participant-team">Nou</div>
                    </div>
                </div>
                <div class="participant-actions">
                    <button class="btn-icon btn-danger kick-participant" title="Elimină">
                        <i class="fas fa-user-slash"></i>
                    </button>
                </div>
            </div>
        `;

        participantsList.insertAdjacentHTML('afterbegin', participantHTML);
    }

    removeParticipantFromList(userId) {
        const participantItem = document.querySelector(`[data-user-id="${userId}"]`);
        if (participantItem) {
            participantItem.remove();
        }
    }

    async kickParticipant(userId) {
        try {
            const result = confirm('Sigur vrei să elimini acest participant?');
            if (!result) return;

            if (api.socket && this.currentSession) {
                api.socket.emit('kick-user', {
                    sessionId: this.currentSession._id,
                    userIdToKick: userId
                });

                authManager.showToast('Participant eliminat', 'success');
            }
        } catch (error) {
            console.error('Kick participant error:', error);
            authManager.showToast('Eroare la eliminarea participantului', 'error');
        }
    }

    filterParticipants(searchTerm) {
        const participants = document.querySelectorAll('.participant-item-control');
        participants.forEach(participant => {
            const name = participant.querySelector('.participant-name').textContent.toLowerCase();
            const isVisible = name.includes(searchTerm.toLowerCase());
            participant.style.display = isVisible ? 'flex' : 'none';
        });
    }

    async endSession(sessionId) {
        try {
            const result = confirm('Sigur vrei să închei această sesiune? Această acțiune este permanentă.');
            if (!result) return;

            const response = await api.endSession(sessionId);
            
            if (response.success) {
                authManager.showToast('Sesiunea a fost încheiată', 'success');
                await this.loadTeacherData();
                this.showDashboard();
            }
        } catch (error) {
            console.error('End session error:', error);
            authManager.showToast(error.message || 'Eroare la încheierea sesiunii', 'error');
        }
    }

    async editSession(sessionId) {
        // Load session data and show edit form
        try {
            const session = await api.getSession(sessionId);
            this.showEditSessionScreen(session);
        } catch (error) {
            console.error('Edit session error:', error);
            authManager.showToast('Eroare la încărcarea sesiunii pentru editare', 'error');
        }
    }

    async viewResults(sessionId) {
        try {
            const session = await api.getSession(sessionId);
            const leaderboard = await api.getLeaderboard(sessionId);
            this.showResultsScreen(session, leaderboard);
        } catch (error) {
            console.error('View results error:', error);
            authManager.showToast('Eroare la încărcarea rezultatelor', 'error');
        }
    }

    async restartSession(sessionId) {
        try {
            const result = confirm('Sigur vrei să restartezi această sesiune? Toate scorurile vor fi resetate.');
            if (!result) return;

            // Reset session status to draft
            await api.updateSession(sessionId, {
                status: 'draft',
                scores: { red: 0, blue: 0 },
                gameHistory: [],
                currentQuestion: null,
                startTime: null,
                endTime: null
            });

            // Reset participant scores
            const session = await api.getSession(sessionId);
            const resetParticipants = session.participants.map(p => ({
                ...p,
                score: 0,
                correctAnswers: 0
            }));

            await api.updateSession(sessionId, {
                participants: resetParticipants
            });

            authManager.showToast('Sesiunea a fost restartată', 'success');
            await this.loadTeacherData();
        } catch (error) {
            console.error('Restart session error:', error);
            authManager.showToast('Eroare la restartarea sesiunii', 'error');
        }
    }

    async deleteSession(sessionId) {
        try {
            const result = confirm('Sigur vrei să ștergi această sesiune? Această acțiune este ireversibilă.');
            if (!result) return;

            const response = await api.deleteSession(sessionId);
            
            if (response.success) {
                authManager.showToast('Sesiunea a fost ștearsă', 'success');
                await this.loadTeacherData();
            }
        } catch (error) {
            console.error('Delete session error:', error);
            authManager.showToast('Eroare la ștergerea sesiunii', 'error');
        }
    }

    copySessionCode(code) {
        navigator.clipboard.writeText(code)
            .then(() => {
                authManager.showToast('Codul a fost copiat în clipboard!', 'success');
            })
            .catch(() => {
                authManager.showToast('Nu s-a putut copia codul', 'error');
            });
    }

    showCreateSessionScreen() {
        // Navigate to create session screen
        window.location.hash = 'create-session';
    }

    showEditSessionScreen(session) {
        // Navigate to edit session screen with session data
        window.location.hash = `edit-session/${session._id}`;
    }

    showResultsScreen(session, leaderboard) {
        // Show results modal
        const modalContent = `
            <div class="results-modal">
                <h2>${session.name} - Rezultate</h2>
                
                <div class="final-scores">
                    <div class="final-score red">
                        <h3>Echipa Roșie</h3>
                        <div class="score">${session.scores?.red || 0} puncte</div>
                    </div>
                    <div class="vs">VS</div>
                    <div class="final-score blue">
                        <h3>Echipa Albastră</h3>
                        <div class="score">${session.scores?.blue || 0} puncte</div>
                    </div>
                </div>
                
                <div class="leaderboard">
                    <h3>Clasament</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Poz.</th>
                                <th>Nume</th>
                                <th>Echipa</th>
                                <th>Scor</th>
                                <th>Corecte</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${leaderboard.map((player, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${player.name}</td>
                                    <td><span class="team-badge ${player.team}">${player.team === 'red' ? 'Roșie' : 'Albastră'}</span></td>
                                    <td>${player.score}</td>
                                    <td>${player.correctAnswers}/${session.questions?.length || 0}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
                
                <div class="modal-actions">
                    <button class="btn btn-primary" onclick="app.closeModal()">Închide</button>
                </div>
            </div>
        `;

        this.showModal(modalContent);
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

    showDashboard() {
        window.location.hash = 'teacher-dashboard';
    }
}

// Initialize Teacher Manager
window.teacherManager = new TeacherManager();
