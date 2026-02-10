// Production PhonePe Integration Client
// Handles interaction with Edge Functions only. Never stores secrets.

window.PaymentService = {
    // 1. Initialize Payment
    async initiatePayment(orderData) {
        try {
            // Disable Button First
            const payBtn = document.getElementById('pay-now-btn');
            if (payBtn) {
                payBtn.disabled = true;
                payBtn.innerHTML = 'Processing... <div class="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent ml-2"></div>';
            }

            // Call Backend (create-payment)
            // Passes necessary info, but secrets remain hidden
            const response = await fetch(`${window.SUPABASE_URL}/functions/v1/create-payment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify({
                    amount: orderData.total, // e.g., 299.00
                    phone: orderData.shippingAddress.phone,
                    userId: window.currentUser?.id,
                    internalOrderId: orderData.internalOrderId, // <--- Link to shop_orders
                    // Redirect back to verify page
                    redirectUrl: window.location.origin + '/client-side/shop.html?verify_payment=true'
                })
            });

            if (!response.ok) {
                const err = await response.json();
                console.error('Edge Function Error:', err);
                throw new Error(err.error || err.message || 'Payment Creation Failed');
            }

            const data = await response.json();

            if (data.success && data.redirectUrl) {
                // Store Order ID for verification on return
                sessionStorage.setItem('pending_payment_id', data.orderId);

                // Redirect User to PhonePe
                window.location.href = data.redirectUrl;
            } else {
                throw new Error('Invalid Response from Payment Server');
            }

        } catch (error) {
            console.error('Payment Error:', error);
            showToast(error.message, 'error');

            // Re-enable button
            if (payBtn) {
                payBtn.disabled = false;
                payBtn.innerHTML = 'Pay Securely <i data-lucide="shield-check" class="w-5 h-5"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        }
    },

    // 2. Verify Payment (On Page Load if ?verify_payment=true)
    async verifyOnReturn() {
        const orderId = sessionStorage.getItem('pending_payment_id');
        if (!orderId) {
            this.showFailureUI('Session Expired or Invalid Order');
            return;
        }

        this.showVerifyingUI();

        // Start Realtime Subscription
        this.subscribeToPaymentStatus(orderId);

        // Fallback: Poll once immediately in case webhook already arrived
        this.checkStatusOnce(orderId);
    },

    // 3. Realtime Subscription (The "Magic")
    subscribeToPaymentStatus(orderId) {
        if (!window.supabaseClient) return;

        console.log('Subscribing to payment updates:', orderId);

        const channel = window.supabaseClient
            .channel(`payment-${orderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'payments',
                    filter: `order_id=eq.${orderId}`
                },
                (payload) => {
                    console.log('Payment Update Received:', payload.new);
                    this.handleStatusChange(payload.new.status);
                }
            )
            .subscribe();

        // Safety Timeout: If no update in 30s, check manually
        setTimeout(() => this.checkStatusOnce(orderId), 5000);
        setTimeout(() => this.checkStatusOnce(orderId), 15000);
        setTimeout(() => this.checkStatusOnce(orderId), 30000); // Reconciliation kick-in time
    },

    async checkStatusOnce(orderId) {
        try {
            const { data, error } = await window.supabaseClient
                .from('payments')
                .select('status')
                .eq('order_id', orderId)
                .single();

            if (data) this.handleStatusChange(data.status);
        } catch (e) {
            console.error('Status Check Error', e);
        }
    },

    handleStatusChange(status) {
        if (status === 'SUCCESS') {
            this.showSuccessUI();
            sessionStorage.removeItem('pending_payment_id');
            CartService.clear();
            updateCartUI();
        } else if (status === 'FAILED') {
            this.showFailureUI('Payment Failed at Bank. Please retry.');
            sessionStorage.removeItem('pending_payment_id');
        } else {
            // Still PENDING, keep waiting UI
            console.log('Status is still pending...');
        }
    },

    // UI Helpers
    showVerifyingUI() {
        document.getElementById('checkout-step-1').classList.add('hidden');
        document.getElementById('checkout-step-2').classList.add('hidden');
        document.getElementById('checkout-step-verifying').classList.remove('hidden');
    },

    showSuccessUI() {
        document.getElementById('checkout-step-verifying').classList.add('hidden');
        document.getElementById('checkout-step-3').classList.remove('hidden');
        showToast('Payment Successful! Order Confirmed.', 'success');
    },

    showFailureUI(msg) {
        document.getElementById('checkout-step-verifying')?.classList.add('hidden');
        document.getElementById('checkout-step-2')?.classList.add('hidden');
        document.getElementById('checkout-step-failed')?.classList.remove('hidden');
        if (msg) showToast(msg, 'error');
    }
};

// Auto-Run Verification on Load if needed
const params = new URLSearchParams(window.location.search);
if (params.get('verify_payment') === 'true') {
    // Wait for Supabase Init
    const checkSupabase = setInterval(() => {
        if (window.supabaseClient) {
            clearInterval(checkSupabase);
            window.PaymentService.verifyOnReturn();
        }
    }, 100);
}
