// Supabase Client Configuration for Client-Side (Public)
// This file uses the ANON key which is safe to expose in frontend

// Supabase configuration
const SUPABASE_URL = 'https://krdhwyhbagecgliabhxw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtyZGh3eWhiYWdlY2dsaWFiaHh3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3NjQ3MzcsImV4cCI6MjA4NTM0MDczN30.f9a_Gz9Wt8_nnt0Dslww4JsuSVOOdgAS_CO3Zo8LTzA';

// Expose to window for use in other scripts (e.g., payment functions)
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;

// Initialize Supabase Client
function initializeSupabase() {
    if (typeof supabase !== 'undefined') {
        // Supabase library is already loaded
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized');

        // Trigger ready callback
        if (window.onSupabaseReady) {
            window.onSupabaseReady();
        }

        // Also check auth state
        checkAuthState();

        return true;
    }
    return false;
}

// Load Supabase JS library from CDN
(function () {
    // Check if already loaded
    if (initializeSupabase()) {
        return;
    }

    // Load the library
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.async = true;

    script.onload = function () {
        if (initializeSupabase()) {
            console.log('Supabase library loaded and client initialized');
        } else {
            console.error('Failed to initialize Supabase client');
        }
    };

    script.onerror = function () {
        console.error('Failed to load Supabase library from CDN');
    };

    document.head.appendChild(script);
})();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSupabase);
} else {
    initSupabase();
}

function initSupabase() {
    // Initialize Supabase client
    if (typeof supabase !== 'undefined' && !window.supabaseClient) {
        window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }

    // Check if user is logged in on page load
    checkAuthState();
}

// Check authentication state
async function checkAuthState() {
    if (!window.supabaseClient) return;

    try {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session) {
            window.currentUser = session.user;
            updateUIForLoggedInUser(session.user);
        } else {
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        console.error('Error checking auth state:', error);
    }
}

// Listen for auth state changes
if (window.supabaseClient) {
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_IN') {
            window.currentUser = session.user;
            updateUIForLoggedInUser(session.user);
        } else if (event === 'SIGNED_OUT') {
            window.currentUser = null;
            updateUIForLoggedOutUser();
        }
    });
}

// Update UI when user logs in
async function updateUIForLoggedInUser(user) {
    // Get user name from profile
    let userName = user.email?.split('@')[0] || 'User';
    let avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    try {
        if (window.authManager) {
            const { profile } = await window.authManager.getUserProfile();
            if (profile) {
                if (profile.name) userName = profile.name;
                if (profile.avatar_url) avatarUrl = profile.avatar_url;
            }
        }
    } catch (e) {
        // Use defaults if profile not found
    }

    // Update profile dropdown
    if (window.updateProfileDropdown) {
        window.updateProfileDropdown(true, userName, avatarUrl);
    } else {
        // Fallback for pages without dropdown
        const authButtons = document.getElementById('auth-buttons');
        const userMenu = document.getElementById('user-menu');

        if (authButtons) authButtons.style.display = 'none';
        if (userMenu) {
            userMenu.style.display = 'block';
            const userNameEl = userMenu.querySelector('#user-name');
            if (userNameEl) {
                userNameEl.textContent = userName;
            }
        }
    }
}

// Update UI when user logs out
function updateUIForLoggedOutUser() {
    // Update profile dropdown
    if (window.updateProfileDropdown) {
        window.updateProfileDropdown(false);
    } else {
        // Fallback for pages without dropdown
        const authButtons = document.getElementById('auth-buttons');
        const userMenu = document.getElementById('user-menu');

        if (authButtons) authButtons.style.display = 'block';
        if (userMenu) userMenu.style.display = 'none';
    }
}

// Export functions for use in other scripts
window.supabaseHelpers = {
    getClient: () => window.supabaseClient,
    getCurrentUser: () => window.currentUser,
    isAuthenticated: () => !!window.currentUser
};