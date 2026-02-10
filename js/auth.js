class AuthManager {
    constructor() {
        this.supabase = window.supabaseClient;
        this.inactivityTimeout = 10 * 60 * 1000; // 10 minutes
        this.lastActivity = Date.now();
        this.setupInactivityTracker();
        this.checkSupabaseReady();
    }

    async checkSupabaseReady() {
        let attempts = 0;
        while (!this.supabase && attempts < 50) {
            await new Promise(resolve => setTimeout(resolve, 100));
            this.supabase = window.supabaseClient;
            attempts++;
        }
    }

    // --- SECURITY: Inactivity Tracker ---
    setupInactivityTracker() {
        const resetTimer = () => {
            this.lastActivity = Date.now();
        };

        // Track user interactions
        ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'].forEach(event => {
            document.addEventListener(event, resetTimer, { passive: true });
        });

        // Interval check
        setInterval(async () => {
            const now = Date.now();
            if (now - this.lastActivity > this.inactivityTimeout) {
                const { data: { session } } = await this.supabase.auth.getSession();
                if (session) {
                    console.warn('Security: Session expired due to inactivity.');
                    await this.signOut();
                    window.location.reload();
                }
            }
        }, 30000); // Check every 30 seconds
    }

    // Sign up new user
    async signUp(email, password, name, phone) {
        if (!this.supabase) throw new Error('System busy, please refresh.');

        try {
            const { data: authData, error: authError } = await this.supabase.auth.signUp({
                email,
                password,
                options: { data: { name, phone } }
            });

            if (authError) throw authError;

            if (authData.user) {
                await this.supabase.from('profiles').upsert({
                    id: authData.user.id,
                    name: name,
                    phone: phone
                });
            }

            return { user: authData.user, error: null };
        } catch (error) {
            return { user: null, error: error.message };
        }
    }

    // Sign in existing user (Email/Password or Phone/Password via lookup)
    async signIn(identifier, password) {
        if (!this.supabase) throw new Error('System busy.');

        try {
            let email = identifier;

            // Check if identifier looks like a phone number (mostly digits)
            const isPhone = /^[0-9+ \-]{10,}$/.test(identifier);

            if (isPhone) {
                // Remove spaces/dashes
                const cleanPhone = identifier.replace(/[^0-9+]/g, ''); // keep + and digits

                // Lookup Email from Profiles
                // NOTE: This relies on 'profiles' being readable by public/anon on 'phone' lookup.
                // If RLS blocks this, you will need a Secure Edge Function.
                const { data: profile, error: lookupError } = await this.supabase
                    .from('profiles')
                    .select('email')
                    .or(`phone.eq.${cleanPhone},phone.eq.${identifier}`)
                    .maybeSingle();

                if (!profile || !profile.email) {
                    throw new Error('Phone number not found or not linked to an account.');
                }
                email = profile.email;
            }

            const { data, error } = await this.supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return { user: data.user, error: null };
        } catch (error) {
            return { user: null, error: error.message };
        }
    }

    // Sign in with Google
    async signInWithGoogle() {
        if (!this.supabase) throw new Error('Supabase not initialized');
        const redirectUrl = window.location.origin;

        try {
            const { data, error } = await this.supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    queryParams: { access_type: 'offline', prompt: 'select_account' },
                    redirectTo: redirectUrl
                }
            });
            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            return { data: null, error: error.message };
        }
    }

    // Sign out
    async signOut() {
        if (!this.supabase) return;
        try {
            await this.supabase.auth.signOut();
            window.currentUser = null;
            // Clear local sensitive data
            localStorage.removeItem('supabase.auth.token');
            return { error: null };
        } catch (error) {
            return { error: error.message };
        }
    }

    // Get current user session
    async getSession() {
        if (!this.supabase) return { session: null, user: null };
        try {
            const { data: { session }, error } = await this.supabase.auth.getSession();
            return { session, user: session?.user || null };
        } catch (error) {
            return { session: null, user: null };
        }
    }

    // Get user profile
    async getUserProfile() {
        if (!this.supabase) return { profile: null, error: 'Not ready' };
        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return { profile: null, error: 'Not authenticated' };

            const { data: profile, error } = await this.supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single();

            if (error) throw error;
            return { profile, error: null };
        } catch (error) {
            return { profile: null, error: error.message };
        }
    }
}

// Initialize auth manager
window.authManager = new AuthManager();

// Helper functions for use in HTML
window.loginUser = async function (email, password) {
    const result = await window.authManager.signIn(email, password);
    return result.error ? { success: false, message: result.error } : { success: true };
};

window.signupUser = async function (email, password, name, phone) {
    const result = await window.authManager.signUp(email, password, name, phone);
    return result.error ? { success: false, message: result.error } : { success: true, message: 'Verify email to continue.' };
};

window.logoutUser = async function () {
    await window.authManager.signOut();
    window.location.href = 'index.html';
};

window.loginWithGoogle = async function (mode = 'login') {
    const btn = document.getElementById(mode === 'login' ? 'google-login-btn' : 'google-signup-btn');
    if (btn) {
        btn.innerHTML = `<div class="flex items-center gap-2"><div class="w-4 h-4 border-2 border-spice-red border-t-transparent rounded-full animate-spin"></div><span>Security Check...</span></div>`;
        btn.disabled = true;
    }
    await window.authManager.signInWithGoogle();
};