class AuthManager {
    constructor() {
        this.user = null;
        this.token = null;
        this.userRole = null;
        this.initFirebase();
    }

    initFirebase() {
        // Initialize Firebase
        if (!firebase.apps.length) {
            firebase.initializeApp(APP_CONFIG.firebaseConfig);
        }
        
        this.auth = firebase.auth();
        this.setupAuthListeners();
    }

    setupAuthListeners() {
        this.auth.onAuthStateChanged(async (user) => {
            if (user) {
                await this.handleUserLogin(user);
            } else {
                this.handleUserLogout();
            }
        });
    }

    async handleUserLogin(firebaseUser) {
        try {
            // Get Firebase token
            const token = await firebaseUser.getIdToken();
            
            // Verify with backend
            const response = await fetch(`${APP_CONFIG.API_CONFIG.BASE_URL}${APP_CONFIG.API_CONFIG.ENDPOINTS.AUTH.VERIFY}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.token = token;
                this.userRole = data.user.role;
                
                // Save to localStorage
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('token', token);
                
                this.redirectBasedOnRole();
            } else {
                throw new Error('Verificarea backend a eșuat');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('Eroare la autentificare', 'error');
        }
    }

    handleUserLogout() {
        this.user = null;
        this.token = null;
        this.userRole = null;
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        window.location.href = '/';
    }

    async register(email, password, name, role) {
        try {
            const response = await fetch(`${APP_CONFIG.API_CONFIG.BASE_URL}${APP_CONFIG.API_CONFIG.ENDPOINTS.AUTH.REGISTER}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password, name, role })
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, data };
            } else {
                const error = await response.json();
                throw new Error(error.message);
            }
        } catch (error) {
            console.error('Register error:', error);
            return { success: false, error: error.message };
        }
    }

    async login(email, password) {
        try {
            const response = await fetch(`${APP_CONFIG.API_CONFIG.BASE_URL}${APP_CONFIG.API_CONFIG.ENDPOINTS.AUTH.LOGIN}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            if (response.ok) {
                const data = await response.json();
                this.user = data.user;
                this.token = data.token;
                this.userRole = data.user.role;
                
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('token', data.token);
                
                return { success: true, data };
            } else {
                const error = await response.json();
                throw new Error(error.message);
            }
        } catch (error) {
            console.error('Login error:', error);
            return { success: false, error: error.message };
        }
    }

    async loginWithGoogle() {
        try {
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.addScope('profile');
            provider.addScope('email');
            
            const result = await this.auth.signInWithPopup(provider);
            return { success: true, user: result.user };
        } catch (error) {
            console.error('Google login error:', error);
            return { success: false, error: error.message };
        }
    }

    logout() {
        this.auth.signOut();
        localStorage.clear();
        window.location.href = '/';
    }

    isAuthenticated() {
        return !!this.user && !!this.token;
    }

    getUser() {
        if (!this.user && localStorage.getItem('user')) {
            this.user = JSON.parse(localStorage.getItem('user'));
            this.token = localStorage.getItem('token');
            this.userRole = this.user?.role;
        }
        return this.user;
    }

    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('token');
        }
        return this.token;
    }

    redirectBasedOnRole() {
        const user = this.getUser();
        if (!user) return;

        if (user.role === 'teacher') {
            window.location.href = '#teacher-dashboard';
        } else if (user.role === 'student') {
            window.location.href = '#student-dashboard';
        }
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
            <span>${message}</span>
        `;
        
        const container = document.getElementById('toast-container');
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize Auth Manager
window.authManager = new AuthManager();
