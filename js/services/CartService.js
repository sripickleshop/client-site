window.CartService = {
    cart: [],
    SHIPPING_COST: 100,

    // --- Persistence Methods ---

    saveLocal() {
        localStorage.setItem('cart', JSON.stringify(this.cart));
    },

    loadLocal() {
        const saved = localStorage.getItem('cart');
        if (saved) {
            try {
                this.cart = JSON.parse(saved);
            } catch (e) {
                console.error('Failed to parse local cart', e);
                this.cart = [];
            }
        }
    },

    async checkAndSyncRemote() {
        if (!window.apiHelpers) return;

        // Wait for Supabase
        await window.apiHelpers.ensureReady();

        const { data: { user } } = await window.apiHelpers.supabase.auth.getUser();
        if (user) {
            console.log('CartService: User logged in, fetching remote cart...');
            const { data: remoteCart, error } = await window.apiHelpers.getCart();

            if (error) {
                console.error('CartService: Failed to fetch remote cart', error);
                return;
            }

            if (remoteCart && remoteCart.length > 0) {
                console.log('CartService: Remote cart found, merging/overwriting local...');
                // Strategy: If remote has items, we use remote. 
                // (Optionally could merge, but usually remote is source of truth for logged in)
                this.cart = remoteCart;
                this.saveLocal();
                window.dispatchEvent(new CustomEvent('cart-updated'));
            } else if (this.cart.length > 0) {
                console.log('CartService: Remote cart empty but local has items, syncing to remote...');
                this.syncRemote();
            }
        }
    },

    async syncRemote() {
        if (!window.apiHelpers) return;
        console.log('Syncing cart to remote...');
        await window.apiHelpers.saveCart(this.cart);
        console.log('Cart persisted to Supabase.');
    },

    async init() {
        console.log('CartService: Initializing...');
        // 1. Load from LocalStorage (Guest Persistence)
        this.loadLocal();

        // 2. Check for logged in user and sync
        // If logged in, this will fetch the remote cart and merge/sync
        await this.checkAndSyncRemote();

        // 3. Validate stock for all items (Guest or Logged in)
        this.validateStock();

        // 4. Periodic check (every 2 minutes)
        setInterval(() => this.validateStock(), 120000); // 2 minutes
    },

    async validateStock() {
        if (this.cart.length === 0 || !window.apiHelpers) return;

        console.log('CartService: Background sync (Price/Stock)...');
        const productIds = [...new Set(this.cart.map(item => item.id))];

        const { data: updatedProducts, error } = await window.apiHelpers.checkProductsAvailability(productIds);

        if (error) {
            console.warn('CartService: Sync failed', error);
            return;
        }

        let itemsRemoved = false;
        let pricesChanged = false;
        const removedNames = [];

        // Filter and update cart based on current database state
        this.cart = this.cart.filter(item => {
            const product = updatedProducts.find(p => p.id === item.id);

            // 1. Remove if product doesn't exist, is inactive, or has 0 stock
            if (!product || !product.active || (product.stock_quantity !== undefined && product.stock_quantity <= 0)) {
                itemsRemoved = true;
                removedNames.push(item.name);
                return false;
            }

            // 2. Check for Price Changes Silently
            let dbPrice = product.price;
            if (product.variants) {
                let variants = product.variants;
                if (typeof variants === 'string') try { variants = JSON.parse(variants); } catch (e) { }

                if (Array.isArray(variants)) {
                    const variant = variants[item.variantIndex];
                    if (variant) dbPrice = variant.price;
                }
            }

            if (dbPrice !== undefined && parseFloat(dbPrice) !== parseFloat(item.price)) {
                console.log(`CartService: Price update for ${item.name} from ₹${item.price} to ₹${dbPrice}`);
                item.price = parseFloat(dbPrice);
                pricesChanged = true;
            }

            return true;
        });

        if (itemsRemoved || pricesChanged) {
            this.saveLocal();
            this.syncRemote();
            window.dispatchEvent(new CustomEvent('cart-updated'));

            if (itemsRemoved) {
                const uniqueRemoved = [...new Set(removedNames)];
                if (window.UIService && window.UIService.showToast) {
                    window.UIService.showToast(`Stock out: ${uniqueRemoved.join(', ')} removed`, "error");
                }
            } else if (pricesChanged) {
                // Subtle log, or a very small toast? User said "silent", so maybe just UI refresh is enough.
                console.log('CartService: Prices updated in background.');
                // If we want a subtle notice:
                // if (window.UIService) window.UIService.showToast("Some item prices were updated.", "info");
            }
        }
    },

    // --- Core Methods ---

    addItem(product, variant, qty = 1, variantIndex = 0) {
        // Basic check before adding
        if (!product.active || (product.stock !== undefined && product.stock <= 0)) {
            if (window.UIService) window.UIService.showToast("Sorry, this product is out of stock!", "error");
            return { error: 'out_of_stock' };
        }

        if (!variant) {
            console.warn('CartService.addItem: variant is undefined, creating fallback');
            variant = { label: 'Standard', price: product.price || 0 };
        }

        const existingIndex = this.cart.findIndex(item =>
            item.id === product.id && item.variantIndex === variantIndex
        );

        if (existingIndex > -1) {
            this.cart[existingIndex].qty += qty;
        } else {
            this.cart.push({
                id: product.id,
                name: product.name,
                image: product.image,
                price: parseFloat(variant.price || product.price || 0),
                qty: qty,
                variantLabel: variant.label || 'Standard',
                variantIndex: variantIndex,
                category: product.category
            });
        }

        this.saveLocal();
        this.syncRemote(); // Persist

        // Fire event
        window.dispatchEvent(new CustomEvent('cart-updated'));

        return { quantity: qty };
    },

    updateQuantity(index, delta) {
        if (this.cart[index]) {
            // Ensure qty is a number to avoid string concatenation
            let currentQty = parseInt(this.cart[index].qty) || 0;
            this.cart[index].qty = currentQty + delta;

            if (this.cart[index].qty <= 0) {
                this.cart.splice(index, 1);
            }
            this.saveLocal();
            this.syncRemote(); // Persist
            window.dispatchEvent(new CustomEvent('cart-updated'));
        }
    },

    removeItem(index) {
        if (this.cart[index]) {
            this.cart.splice(index, 1);
            this.saveLocal();
            this.syncRemote(); // Persist
            window.dispatchEvent(new CustomEvent('cart-updated'));
        }
    },
    // ... (lines 16-168 unchanged) ...

    getTotals() {
        const totalQty = this.cart.reduce((acc, i) => acc + (parseInt(i.qty) || 0), 0);
        const subtotal = this.cart.reduce((acc, i) => acc + ((parseFloat(i.price) || 0) * (parseInt(i.qty) || 0)), 0);

        // Removed GST as per request
        const gst = 0;

        const shipping = this.cart.length > 0 ? this.SHIPPING_COST : 0;
        const total = subtotal + gst + shipping;

        return { totalQty, subtotal, gst, shipping, total };
    },

    isEmpty() {
        return this.cart.length === 0;
    },

    getItems() {
        return this.cart;
    },

    getItem(index) {
        return this.cart[index];
    },

    clear() {
        this.cart = [];
        this.saveLocal();
        this.syncRemote();
    }
};

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.CartService.init());
} else {
    window.CartService.init();
}
