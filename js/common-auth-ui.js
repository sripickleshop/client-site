// Common Auth UI Manager
// Enables Login/Signup/Profile functionality across all pages without redirection.

(function () {
    // Utility for XSS protection
    window.safeHTML = function (str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };

    // Modal HTML Templates
    const LOGIN_MODAL_HTML = `
    <div id="login-modal" class="fixed inset-0 z-[60] hidden flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative animate-in fade-in zoom-in">
            <div class="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 border-b pb-2">
                <h3 class="font-serif text-2xl font-bold text-spice-red">Login</h3>
                <button onclick="closeLoginModal()" class="text-gray-400 hover:text-gray-700">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <form id="login-form" onsubmit="handleLogin(event)" class="space-y-4 pt-2">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                    <input type="email" id="login-email" required class="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-spice-red">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                    <input type="password" id="login-password" required class="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-spice-red">
                </div>
                <div id="login-error" class="text-red-600 text-sm hidden"></div>
                <button type="submit" class="w-full bg-spice-red text-white py-3 rounded-md font-bold hover:bg-red-700 transition-colors">
                    Login
                </button>
                <div class="relative flex py-2 items-center">
                    <div class="flex-grow border-t border-gray-300"></div>
                    <span class="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase">Or</span>
                    <div class="flex-grow border-t border-gray-300"></div>
                </div>
                <button type="button" id="google-login-btn" onclick="window.loginWithGoogle('login')" class="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-md font-bold hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Sign in with Google</span>
                </button>
            </form>
            <p class="mt-4 text-center text-sm text-gray-600">
                Don't have an account? <button onclick="closeLoginModal(); openSignupModal();" class="text-spice-red font-semibold hover:underline">Sign up</button>
            </p>
        </div>
    </div>`;

    const SIGNUP_MODAL_HTML = `
    <div id="signup-modal" class="fixed inset-0 z-[60] hidden flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
        <div class="bg-white rounded-lg shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 relative animate-in fade-in zoom-in">
            <div class="flex justify-between items-center mb-6 sticky top-0 bg-white z-10 border-b pb-2">
                <h3 class="font-serif text-2xl font-bold text-spice-red">Create Account</h3>
                <button onclick="closeSignupModal()" class="text-gray-400 hover:text-gray-700">
                    <i data-lucide="x" class="w-5 h-5"></i>
                </button>
            </div>
            <form id="signup-form" onsubmit="handleSignup(event)" class="space-y-4 pt-2">
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Full Name <span class="text-red-500">*</span></label>
                    <input type="text" id="signup-name" required class="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-spice-red">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Phone <span class="text-red-500">*</span></label>
                    <div class="flex items-center border border-gray-300 rounded overflow-hidden focus-within:border-spice-red bg-white">
                        <span class="bg-gray-100 px-3 py-2 text-gray-500 font-bold border-r border-gray-300 text-sm flex items-center h-full select-none">+91</span>
                        <input type="tel" id="signup-phone" required maxlength="10" placeholder="XXXXX XXXXX" 
                            oninput="this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10)" 
                            class="flex-1 p-2 focus:outline-none w-full text-gray-700 font-medium">
                    </div>
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                    <input type="email" id="signup-email" required class="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-spice-red">
                </div>
                <div>
                    <label class="block text-sm font-semibold text-gray-700 mb-1">Password</label>
                    <input type="password" id="signup-password" required minlength="6" class="w-full border border-gray-300 rounded p-2 focus:outline-none focus:border-spice-red">
                    <p class="text-xs text-gray-500 mt-1">Minimum 6 characters</p>
                </div>
                <div id="signup-error" class="text-red-600 text-sm hidden"></div>
                <button type="submit" class="w-full bg-spice-red text-white py-3 rounded-md font-bold hover:bg-red-700 transition-colors">
                    Create Account
                </button>
                <div class="relative flex py-2 items-center">
                    <div class="flex-grow border-t border-gray-300"></div>
                    <span class="flex-shrink-0 mx-4 text-gray-400 text-xs font-bold uppercase">Or</span>
                    <div class="flex-grow border-t border-gray-300"></div>
                </div>
                <button type="button" id="google-signup-btn" onclick="window.loginWithGoogle('signup')" class="w-full bg-white border border-gray-300 text-gray-700 py-3 rounded-md font-bold hover:bg-gray-50 hover:border-gray-400 transition-all flex items-center justify-center gap-3 shadow-sm active:scale-95">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                    <span>Sign up with Google</span>
                </button>
            </form>
            <p class="mt-4 text-center text-sm text-gray-600">
                Already have an account? <button onclick="closeSignupModal(); openLoginModal();" class="text-spice-red font-semibold hover:underline">Login</button>
            </p>
        </div>
    </div>`;

    // Inject styles for Lucide icons if not already present (sometimes Lucide doesn't auto-style dynamically injected icons)
    function ensureModalsExist() {
        if (!document.getElementById('login-modal')) {
            document.body.insertAdjacentHTML('beforeend', LOGIN_MODAL_HTML);
        }
        if (!document.getElementById('signup-modal')) {
            document.body.insertAdjacentHTML('beforeend', SIGNUP_MODAL_HTML);
        }

        // Re-initialize icons for the new content if Lucide is available
        if (typeof lucide !== 'undefined' && lucide.createIcons) {
            lucide.createIcons();
        }
    }

    // Modal Control Functions
    window.openLoginModal = function () {
        ensureModalsExist();
        const modal = document.getElementById('login-modal');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.closeLoginModal = function () {
        const modal = document.getElementById('login-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            const form = document.getElementById('login-form');
            if (form) form.reset();
            const error = document.getElementById('login-error');
            if (error) error.classList.add('hidden');
        }
    };

    window.openSignupModal = function () {
        ensureModalsExist();
        const modal = document.getElementById('signup-modal');
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.closeSignupModal = function () {
        const modal = document.getElementById('signup-modal');
        if (modal) {
            modal.classList.add('hidden');
            document.body.style.overflow = '';
            const form = document.getElementById('signup-form');
            if (form) form.reset();
            const error = document.getElementById('signup-error');
            if (error) error.classList.add('hidden');
        }
    };

    // Shared Auth Handlers
    window.handleLogin = async function (event) {
        event.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const errorDiv = document.getElementById('login-error');

        if (errorDiv) errorDiv.classList.add('hidden');

        // Use global loginUser from auth.js
        if (window.loginUser) {
            const result = await window.loginUser(email, password);
            if (result.success) {
                closeLoginModal();
                showToast('Logged in successfully!');
                setTimeout(() => window.location.reload(), 500);
            } else {
                if (errorDiv) {
                    errorDiv.textContent = result.message;
                    errorDiv.classList.remove('hidden');
                } else {
                    alert(result.message);
                }
            }
        } else {
            console.error('auth.js not loaded');
        }
    };

    window.handleSignup = async function (event) {
        event.preventDefault();
        const name = document.getElementById('signup-name').value;
        const phone = document.getElementById('signup-phone').value;
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const errorDiv = document.getElementById('signup-error');

        if (errorDiv) errorDiv.classList.add('hidden');

        if (window.signupUser) {
            const result = await window.signupUser(email, password, name, phone);
            if (result.success) {
                closeSignupModal();
                showToast(result.message);
                setTimeout(() => window.location.reload(), 1500);
            } else {
                if (errorDiv) {
                    errorDiv.textContent = result.message;
                    errorDiv.classList.remove('hidden');
                } else {
                    alert(result.message);
                }
            }
        } else {
            console.error('auth.js not loaded');
        }
    };

    // Profile Dropdown Logic (Unified)
    window.toggleProfileDropdown = function () {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.classList.toggle('hidden');
    };

    window.closeProfileDropdown = function () {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.classList.add('hidden');
    };

    // Close dropdown when clicking outside
    document.addEventListener('click', function (event) {
        const dropdown = document.getElementById('profile-dropdown');
        const button = document.getElementById('profile-button');
        const iconButton = document.getElementById('profile-icon-button');

        if (dropdown && !dropdown.contains(event.target) &&
            !button?.contains(event.target) &&
            !iconButton?.contains(event.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // Unified Profile Update Logic
    window.updateProfileDropdown = function (isLoggedIn, userName, avatarUrl) {
        const profileButton = document.getElementById('profile-button');
        const profileIconButton = document.getElementById('profile-icon-button');
        const dropdownNotLoggedIn = document.getElementById('dropdown-not-logged-in');
        const dropdownLoggedIn = document.getElementById('dropdown-logged-in');
        const profileNameDisplay = document.getElementById('profile-name-display');

        if (isLoggedIn) {
            if (profileButton) {
                profileButton.classList.remove('hidden');
                // Update avatar if provided
                const avatarIcon = profileButton.querySelector('div');
                if (avatarUrl && avatarIcon) {
                    avatarIcon.innerHTML = `<img src="${avatarUrl}" class="w-full h-full object-cover rounded-full">`;
                    avatarIcon.classList.remove('bg-spice-red'); // Remove background color
                } else if (avatarIcon) {
                    avatarIcon.innerHTML = `<i data-lucide="user" class="w-5 h-5"></i>`;
                    avatarIcon.classList.add('bg-spice-red');
                    if (typeof lucide !== 'undefined') lucide.createIcons();
                }
            }
            if (profileIconButton) {
                profileIconButton.classList.add('hidden');
            }
            if (dropdownNotLoggedIn) dropdownNotLoggedIn.classList.add('hidden');
            if (dropdownLoggedIn) dropdownLoggedIn.classList.remove('hidden');
            if (profileNameDisplay) profileNameDisplay.innerHTML = window.safeHTML(userName) || 'Account';
        } else {
            if (profileButton) profileButton.classList.add('hidden');
            if (profileIconButton) profileIconButton.classList.remove('hidden');
            if (dropdownNotLoggedIn) dropdownNotLoggedIn.classList.remove('hidden');
            if (dropdownLoggedIn) dropdownLoggedIn.classList.add('hidden');
        }
    };

    // Handle Logout
    window.handleLogout = async function () {
        if (window.logoutUser) {
            // Clear cart locally before logging out
            if (window.CartService) {
                window.CartService.cart = [];
                window.CartService.saveLocal();
            }
            await window.logoutUser();
            updateProfileDropdown(false);
            closeProfileDropdown();
            showToast('Logged out');
            // Wait a bit and redirect to home if on a protected page, or just reload
            if (window.location.pathname.includes('profile.html') || window.location.pathname.includes('order-history.html')) {
                window.location.href = 'index.html';
            } else {
                window.location.reload();
            }
        }
    };

    // Helper: Show Toast (Simple fallback if UIService not available)
    function showToast(message, type = 'success') {
        if (window.UIService && window.UIService.showToast) {
            window.UIService.showToast(message, type);
            return;
        }

        // Fallback Toast
        const container = document.getElementById('toast-container') || createToastContainer();
        const toast = document.createElement('div');
        toast.className = `bg-gray-900 text-white px-6 py-3 rounded-lg shadow-xl mb-3 transition-opacity duration-300 opacity-0 transform translate-y-2 flex items-center gap-2`;
        toast.innerHTML = `<span>${message}</span>`;
        container.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.remove('opacity-0', 'translate-y-2');
        });

        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    function createToastContainer() {
        const div = document.createElement('div');
        div.id = 'toast-container';
        div.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 z-[70] flex flex-col gap-2 items-center';
        document.body.appendChild(div);
        return div;
    }

    // Initialize Auth Listeners (Wait for Supabase)
    const initInterval = setInterval(async () => {
        if (window.authManager) {
            clearInterval(initInterval);
            const { session } = await window.authManager.getSession();
            if (session && session.user) {
                const { profile } = await window.authManager.getUserProfile();
                const name = profile?.name || session.user.user_metadata?.name || session.user.email?.split('@')[0] || 'User';
                const avatarUrl = profile?.avatar_url || session.user.user_metadata?.avatar_url || session.user.user_metadata?.picture;
                updateProfileDropdown(true, name, avatarUrl);
            } else {
                updateProfileDropdown(false);
            }
        }
    }, 500);

    // Also run ensureModalsExist on DOMContentLoaded to preload (optional, but good)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', ensureModalsExist);
    } else {
        // If already loaded, we don't necessarily force inject yet, 
        // we wait for user action or just inject now if we want to be safe.
        // Let's inject on demand to keep DOM clean, OR inject now. 
        // Injecting now ensures no delay on first click.
        ensureModalsExist();
    }

})();
