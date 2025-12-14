class GameManager {
    constructor() {
        this.currentSession = null;
        this.currentQuestion = null;
        this.team = null;
        this.score = { red: 0, blue: 0 };
        this.timer = null;
        this.timeLeft = 0;
        this.isAnswered = false;
    }

    async joinGame(sessionCode) {
        try {
            const response = await api.joinSession(sessionCode);
            
            if (response.success) {
                this.currentSession = response.session;
                this.team = response.team;
                
                // Connect to socket for real-time updates
                api.connectSocket();
                api.joinSessionRoom(this.currentSession._id);
                
                this.setupGameListeners();
                this.showGameScreen();
                
                return { success: true, session: response.session };
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            console.error('Join game error:', error);
            return { success: false, error: error.message };
        }
    }

    setupGameListeners() {
        if (!this.currentSession) return;

        const sessionId = this.currentSession._id;

        // Listen for session updates
        api.onSessionUpdate(sessionId, (data) => {
            if (data.status === 'started') {
                this.currentSession = data.session;
                this.showQuestion();
            } else if (data.status === 'ended') {
                this.endGame();
            }
        });

        // Listen for question updates
        api.onQuestionUpdate(sessionId, (question) => {
            this.currentQuestion = question;
            this.showQuestion();
        });

        // Listen for score updates
        api.onScoreUpdate(sessionId, (scores) => {
            this.score = scores;
            this.updateScoreDisplay();
            this.updateTugVisualization();
        });
    }

    showGameScreen() {
        // Hide all screens
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });

        // Create game screen content
        const gameContainer = document.getElementById('game-container');
        gameContainer.innerHTML = this.createGameTemplate();

        // Show game screen
        document.getElementById('game-screen').classList.add('active');

        // Update UI based on team
        this.updateTeamDisplay();
        
        // If game is already started, show current question
        if (this.currentSession.status === 'started') {
            this.loadCurrentQuestion();
        }
    }

    createGameTemplate() {
        return `
            <div class="tug-of-war-game">
                <div class="game-header">
                    <h2>${this.currentSession.name}</h2>
                    <div class="session-info">
                        <span class="session-code">${this.currentSession.code}</span>
                        <span id="game-status">${this.currentSession.status === 'waiting' ? 'În așteptare...' : 'În desfășurare'}</span>
                    </div>
                </div>

                <div class="teams-display">
                    <div class="team-card team-red">
                        <h3>Echipa Roșie</h3>
                        <div class="team-score" id="red-score">0</div>
                        <div id="red-members-count">0 jucători</div>
                    </div>
                    
                    <div class="team-card team-blue">
                        <h3>Echipa Albastră</h3>
                        <div class="team-score" id="blue-score">0</div>
                        <div id="blue-members-count">0 jucători</div>
                    </div>
                </div>

                <div class="tug-visualization">
                    <div class="rope"></div>
                    <div class="rope-center" id="rope-center">0-0</div>
                    <div class="pullers">
                        <div class="puller puller-red" id="puller-red"></div>
                        <div class="puller puller-blue" id="puller-blue"></div>
                    </div>
                </div>

                <div class="game-info">
                    <div class="team-badge" id="player-team-badge">
                        <i class="fas fa-user"></i>
                        <span>Echipa ta: ${this.team === 'red' ? 'Roșie' : 'Albastră'}</span>
                    </div>
                    <div class="timer-container">
                        <i class="fas fa-clock"></i>
                        <span id="game-timer">00</span>
                    </div>
                    <div class="question-counter">
                        <span id="question-counter">Întrebarea 0/0</span>
                    </div>
                </div>

                <div class="question-display" id="question-display">
                    <!-- Question will be loaded here -->
                </div>
            </div>
        `;
    }

    updateTeamDisplay() {
        const badge = document.getElementById('player-team-badge');
        if (badge) {
            badge.style.backgroundColor = this.team === 'red' ? 'var(--team-red)' : 'var(--team-blue)';
            badge.style.color = 'white';
        }
    }

    async loadCurrentQuestion() {
        if (!this.currentSession.currentQuestion) return;

        try {
            const questions = await api.getSessionQuestions(this.currentSession._id);
            const currentQuestion = questions.find(q => q._id === this.currentSession.currentQuestion);
            
            if (currentQuestion) {
                this.currentQuestion = currentQuestion;
                this.showQuestion();
            }
        } catch (error) {
            console.error('Load question error:', error);
        }
    }

    showQuestion() {
        if (!this.currentQuestion) return;

        const questionDisplay = document.getElementById('question-display');
        if (!questionDisplay) return;

        questionDisplay.innerHTML = this.createQuestionTemplate();
        this.startTimer();
    }

    createQuestionTemplate() {
        return `
            <div class="question-content">
                <h3 class="question-text">${this.currentQuestion.text}</h3>
                <div class="answers-grid">
                    ${this.currentQuestion.answers.map((answer, index) => `
                        <button class="answer-button" data-index="${index}" onclick="gameManager.submitAnswer(${index})">
                            <span class="answer-letter">${String.fromCharCode(65 + index)}.</span>
                            <span class="answer-text">${answer}</span>
                        </button>
                    `).join('')}
                </div>
                <div class="timer-display">
                    <i class="fas fa-hourglass-half"></i>
                    <span id="question-timer">${this.timeLeft}</span> secunde rămase
                </div>
            </div>
        `;
    }

    startTimer() {
        this.timeLeft = this.currentSession.timePerQuestion || 20;
        this.isAnswered = false;

        if (this.timer) clearInterval(this.timer);

        this.timer = setInterval(() => {
            this.timeLeft--;
            document.getElementById('question-timer').textContent = this.timeLeft;

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.handleTimeUp();
            }
        }, 1000);
    }

    async submitAnswer(answerIndex) {
        if (this.isAnswered) return;

        this.isAnswered = true;
        clearInterval(this.timer);

        try {
            await api.submitAnswer(this.currentSession._id, this.currentQuestion._id, answerIndex);
            
            // Highlight selected answer
            const buttons = document.querySelectorAll('.answer-button');
            buttons.forEach(button => button.disabled = true);
            
            const selectedButton = buttons[answerIndex];
            if (selectedButton) {
                const isCorrect = answerIndex === this.currentQuestion.correctAnswer;
                selectedButton.classList.add(isCorrect ? 'correct' : 'incorrect');
            }
        } catch (error) {
            console.error('Submit answer error:', error);
        }
    }

    handleTimeUp() {
        this.isAnswered = true;
        const buttons = document.querySelectorAll('.answer-button');
        buttons.forEach(button => button.disabled = true);
    }

    updateScoreDisplay() {
        document.getElementById('red-score').textContent = this.score.red;
        document.getElementById('blue-score').textContent = this.score.blue;
        document.getElementById('rope-center').textContent = `${this.score.red}-${this.score.blue}`;
    }

    updateTugVisualization() {
        const totalScore = this.score.red + this.score.blue;
        if (totalScore === 0) return;

        const redPercentage = (this.score.red / totalScore) * 100;
        const bluePercentage = (this.score.blue / totalScore) * 100;

        // Calculate rope center position (0-100%)
        const ropePosition = 50 + ((this.score.red - this.score.blue) / totalScore) * 40;
        
        const ropeCenter = document.getElementById('rope-center');
        const pullerRed = document.getElementById('puller-red');
        const pullerBlue = document.getElementById('puller-blue');

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

    async endGame() {
        clearInterval(this.timer);
        
        // Show results screen
        const gameContainer = document.getElementById('game-container');
        const leaderboard = await api.getLeaderboard(this.currentSession._id);
        
        gameContainer.innerHTML = this.createResultsTemplate(leaderboard);
    }

    createResultsTemplate(leaderboard) {
        const winner = this.score.red > this.score.blue ? 'Roșie' : 
                      this.score.blue > this.score.red ? 'Albastră' : 'Egalitate';
        
        return `
            <div class="game-results">
                <div class="results-header">
                    <h2>Jocul s-a încheiat!</h2>
                    <p class="winner-announcement">Câștigător: <span class="winner">Echipa ${winner}</span></p>
                </div>

                <div class="final-scores">
                    <div class="final-score red">
                        <h3>Echipa Roșie</h3>
                        <div class="score">${this.score.red} puncte</div>
                    </div>
                    <div class="vs">VS</div>
                    <div class="final-score blue">
                        <h3>Echipa Albastră</h3>
                        <div class="score">${this.score.blue} puncte</div>
                    </div>
                </div>

                <div class="leaderboard">
                    <h3><i class="fas fa-trophy"></i> Clasament</h3>
                    <table>
                        <thead>
                            <tr>
                                <th>Poz.</th>
                                <th>Nume</th>
                                <th>Echipa</th>
                                <th>Scor</th>
                                <th>Răspunsuri corecte</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${leaderboard.map((player, index) => `
                                <tr>
                                    <td>${index + 1}</td>
                                    <td>${player.name}</td>
                                    <td><span class="team-badge ${player.team}">${player.team === 'red' ? 'Roșie' : 'Albastră'}</span></td>
                                    <td>${player.score}</td>
                                    <td>${player.correctAnswers}/${player.totalAnswers}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>

                <div class="results-actions">
                    <button class="btn btn-primary" onclick="location.reload()">
                        <i class="fas fa-redo"></i> Joacă din nou
                    </button>
                    <button class="btn btn-secondary" onclick="window.location.href='#'">
                        <i class="fas fa-home"></i> Înapoi acasă
                    </button>
                </div>
            </div>
        `;
    }

    cleanup() {
        clearInterval(this.timer);
        if (this.currentSession) {
            api.removeSessionListeners(this.currentSession._id);
            api.leaveSessionRoom(this.currentSession._id);
        }
        this.currentSession = null;
        this.currentQuestion = null;
        this.team = null;
        this.score = { red: 0, blue: 0 };
    }
}

// Initialize Game Manager
window.gameManager = new GameManager();
