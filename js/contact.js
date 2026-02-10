tailwind.config = {
    theme: {
        extend: {
            colors: {
                'spice-red': '#B9382E',
                'turmeric': '#EUA904',
                'saffron': '#FF9933',
                'mango-green': '#586E37',
                'clay': '#8D5B4C',
                'sand': '#FDFBF7',
                'gold': '#D4AF37',
            },
            fontFamily: {
                serif: ['"Crimson Text"', 'serif'],
                sans: ['"Lato"', 'sans-serif'],
            },
        }
    }
}

lucide.createIcons();

// Profile dropdown logic handled by common-auth-ui.js

// Contact Form Submission

async function submitContactForm(event) {
    event.preventDefault();
    const errorDiv = document.getElementById('contact-error');
    const successDiv = document.getElementById('contact-success');
    const btn = event.target.querySelector('button[type="submit"]');

    errorDiv.classList.add('hidden');
    successDiv.classList.add('hidden');

    // Disable Button
    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `Sending... <i data-lucide="loader-2" class="w-4 h-4 animate-spin ml-2"></i>`;
    lucide.createIcons();

    const name = document.getElementById('contact-name').value;
    const email = document.getElementById('contact-email').value;
    const phone = document.getElementById('contact-phone').value;
    const subject = document.getElementById('contact-subject').value;
    const message = document.getElementById('contact-message').value;

    try {
        // 1. Save to Database
        if (!window.supabaseClient) {
            throw new Error("System is initializing, please try again in a moment.");
        }

        const { error: dbError } = await window.supabaseClient
            .from('customer_queries')
            .insert([{
                name,
                email,
                phone: phone || null,
                subject,
                message,
                status: 'pending'
            }]);

        if (dbError) throw dbError;

        // 2. Email Notification skipped as per requirement (Client only saves to DB)
        // Admin will view queries in the panel.

        // 2. Success Feedback
        successDiv.textContent = 'Message sent successfully! We will get back to you soon.';
        successDiv.classList.remove('hidden');

        // 3. Reset Form
        setTimeout(() => {
            document.getElementById('contact-form').reset();
            successDiv.classList.add('hidden');
        }, 5000);

    } catch (err) {
        console.error('Contact submit error:', err);

        // Fallback to Mailto if DB fails (robustness) or just show error
        errorDiv.textContent = 'Something went wrong. Please try emailing us directly.';
        errorDiv.classList.remove('hidden');

        // Optional: Open mailto as backup
        // window.location.href = `mailto:namaste@acharheritage.com?subject=${encodeURIComponent("Contact Form Backup: "+subject)}&body=${encodeURIComponent(message)}`;

    } finally {
        btn.disabled = false;
        btn.innerHTML = originalBtnText;
        lucide.createIcons();
    }
}

// Initialize dropdown
// common-auth-ui.js handles auth state
