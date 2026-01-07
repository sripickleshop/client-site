// API Helper Functions for Client-Side
// Functions to interact with Supabase database

class ApiHelpers {
    constructor() {
        this.supabase = null;
        this.initialized = false;
        this.initPromise = this.checkSupabaseReady();
    }

    async checkSupabaseReady() {
        // Wait for Supabase client to be available
        let attempts = 0;
        const maxAttempts = 100;

        while (!this.supabase && attempts < maxAttempts) {
            if (window.supabaseClient) {
                this.supabase = window.supabaseClient;
                this.initialized = true;
                console.log('ApiHelpers: Supabase client connected');
                return true;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!this.supabase) {
            console.error('ApiHelpers: Failed to initialize Supabase client after', maxAttempts, 'attempts');
            return false;
        }

        this.initialized = true;
        return true;
    }

    // Ensure Supabase is ready before making queries
    async ensureReady() {
        if (this.initialized && this.supabase) {
            return true;
        }
        return await this.checkSupabaseReady();
    }

    // Fetch all active products
    async getProducts(category = null) {
        // Ensure Supabase is ready
        const ready = await this.ensureReady();
        if (!ready) {
            console.error('Supabase not initialized');
            return { data: [], error: 'Supabase not initialized. Please refresh the page.' };
        }

        try {
            console.log('Fetching products from Supabase...');
            let query = this.supabase
                .from('shop_products') // Updated table
                .select('*')
                .eq('active', true)
                .order('created_at', { ascending: false });

            if (category && category !== 'all') {
                query = query.eq('category', category);
            }

            const { data, error } = await query;

            if (error) {
                console.error('Supabase query error:', error);
                throw error;
            }

            console.log(`Received ${data?.length || 0} products from database`);

            // Transform data to match frontend format
            const transformedData = (data || []).map(product => {
                // Ensure variants is an array (it's JSONB in database)
                let variants = product.variants;
                if (typeof variants === 'string') {
                    try {
                        variants = JSON.parse(variants);
                    } catch (e) {
                        console.warn('Failed to parse variants for product:', product.name);
                        variants = [];
                    }
                }

                return {
                    id: product.id,
                    name: product.name,
                    category: product.category,
                    image: product.image_url,
                    tag: product.tag || product.category,
                    rating: parseFloat(product.rating) || 4.5,
                    description: product.description || '',
                    stock: product.stock_quantity !== undefined ? product.stock_quantity : 0,
                    active: product.active !== undefined ? product.active : true,
                    price: product.price,
                    variants: Array.isArray(variants) ? variants : []
                };
            });

            return { data: transformedData, error: null };
        } catch (error) {
            console.error('Error fetching products:', error);
            return { data: [], error: error.message || 'Failed to fetch products' };
        }
    }

    // Fetch single product by ID
    async getProduct(productId) {
        if (!this.supabase) {
            return { data: null, error: 'Supabase not initialized' };
        }

        try {
            const { data, error } = await this.supabase
                .from('shop_products') // Updated table
                .select('*')
                .eq('id', productId)
                .eq('active', true)
                .single();

            if (error) throw error;

            // Ensure variants is an array (it's JSONB in database)
            let variants = data.variants;
            if (typeof variants === 'string') {
                try {
                    variants = JSON.parse(variants);
                } catch (e) {
                    console.warn('Failed to parse variants for product:', data.name);
                    variants = [];
                }
            }

            // Transform to frontend format
            const transformed = {
                id: data.id,
                name: data.name,
                category: data.category,
                image: data.image_url,
                tag: data.tag || data.category,
                rating: parseFloat(data.rating) || 4.5,
                description: data.description || '',
                variants: Array.isArray(variants) ? variants : []
            };

            return { data: transformed, error: null };
        } catch (error) {
            console.error('Error fetching product:', error);
            return { data: null, error: error.message };
        }
    }

    // Create order
    async createOrder(orderData) {
        if (!this.supabase) {
            return { data: null, error: 'Supabase not initialized' };
        }

        try {
            // Get current user (optional for orders now)
            const { data: { user } } = await this.supabase.auth.getUser();

            // Prepare order data
            const order = {
                user_id: user ? user.id : null,
                status: orderData.status || 'pending',
                total_amount: orderData.total,
                subtotal: orderData.subtotal,
                gst: orderData.gst,
                shipping_cost: orderData.shipping,
                discount: orderData.discount || 0,
                promo_code: orderData.promo_code || null,
                shipping_address: orderData.shippingAddress,
                billing_address: orderData.billingAddress || orderData.shippingAddress,
                payment_method: orderData.paymentMethod || null,
                payment_id: orderData.paymentId || null,
                payment_status: orderData.paymentStatus || 'pending'
            };

            // Create order
            const { data: createdOrder, error: orderError } = await this.supabase
                .from('shop_orders')
                .insert(order)
                .select()
                .single();

            if (orderError) throw orderError;

            // Create order items & Deduct Stock
            const orderItems = [];
            for (const item of orderData.items) {
                // Prapare Item
                orderItems.push({
                    order_id: createdOrder.id,
                    product_id: item.product_id || null,
                    product_name: item.name,
                    variant_label: item.variantLabel,
                    quantity: item.quantity,
                    price: item.price
                });

                // Deduct Stock via RPC (Fire and forget, or await?)
                // We await to ensure consistency, but if it fails, we don't rollback order (MVP trade-off)
                try {
                    await this.supabase.rpc('deduct_stock', {
                        p_product_id: item.product_id,
                        p_quantity: item.quantity,
                        p_variant_label: item.variantLabel || null
                    });
                } catch (stockErr) {
                    console.error('Stock Update Failed:', stockErr);
                }
            }

            const { error: itemsError } = await this.supabase
                .from('shop_order_items')
                .insert(orderItems);

            if (itemsError) throw itemsError;

            return { data: createdOrder, error: null };
        } catch (error) {
            console.error('Error creating order:', error);
            return { data: null, error: error.message };
        }
    }

    // Update order payment status
    async updateOrderPayment(orderId, paymentId, paymentMethod) {
        if (!this.supabase) {
            return { error: 'Supabase not initialized' };
        }

        try {
            const { error } = await this.supabase
                .from('shop_orders') // Updated table
                .update({
                    payment_id: paymentId,
                    payment_method: paymentMethod,
                    payment_status: 'completed',
                    status: 'processing'
                })
                .eq('id', orderId);

            if (error) throw error;
            return { error: null };
        } catch (error) {
            console.error('Error updating order payment:', error);
            return { error: error.message };
        }
    }

    // Get user's orders
    async getUserOrders() {
        if (!this.supabase) {
            return { data: [], error: 'Supabase not initialized' };
        }

        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                return { data: [], error: 'User must be logged in' };
            }

            const { data: orders, error } = await this.supabase
                .from('shop_orders') // Updated table
                .select('*, shop_order_items(*)') // Relation name will likely update if table updates
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { data: orders || [], error: null };
        } catch (error) {
            console.error('Error fetching user orders:', error);
            return { data: [], error: error.message };
        }
    }

    // Get single order
    async getOrder(orderId) {
        if (!this.supabase) {
            return { data: null, error: 'Supabase not initialized' };
        }

        try {
            const { data, error } = await this.supabase
                .from('shop_orders') // Updated table
                .select('*, shop_order_items(*)')
                .eq('id', orderId)
                .single();

            if (error) throw error;
            return { data, error: null };
        } catch (error) {
            console.error('Error fetching order:', error);
            return { data: null, error: error.message };
        }
    }

    // Save/Update user address
    async saveAddress(addressData) {
        if (!this.supabase) {
            return { data: null, error: 'Supabase not initialized' };
        }

        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                return { data: null, error: 'User must be logged in' };
            }

            // If setting as default, unset other defaults
            if (addressData.is_default) {
                await this.supabase
                    .from('addresses')
                    .update({ is_default: false })
                    .eq('user_id', user.id);
            }

            const address = {
                user_id: user.id,
                name: addressData.name,
                phone: addressData.phone,
                address: addressData.address,
                city: addressData.city,
                state: addressData.state,
                pincode: addressData.pincode,
                is_default: addressData.is_default || false
            };

            let result;
            if (addressData.id) {
                // Update existing
                const { data, error } = await this.supabase
                    .from('addresses')
                    .update(address)
                    .eq('id', addressData.id)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
            } else {
                // Create new
                const { data, error } = await this.supabase
                    .from('addresses')
                    .insert(address)
                    .select()
                    .single();
                if (error) throw error;
                result = data;
            }

            return { data: result, error: null };
        } catch (error) {
            console.error('Error saving address:', error);
            return { data: null, error: error.message };
        }
    }

    // Get user addresses
    async getUserAddresses() {
        if (!this.supabase) {
            return { data: [], error: 'Supabase not initialized' };
        }

        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) {
                return { data: [], error: 'User must be logged in' };
            }

            const { data: addresses, error } = await this.supabase
                .from('addresses')
                .select('*')
                .eq('user_id', user.id)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false });

            if (error) throw error;
            return { data: addresses || [], error: null };
        } catch (error) {
            console.error('Error fetching addresses:', error);
            return { data: [], error: error.message };
        }
    }

    // --- Cart Persistence ---

    // Load cart from Supabase
    async getCart() {
        if (!this.supabase) return { data: [], error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return { data: [], error: 'User not logged in' };

            // Fetch items from 'cart' table (has user_id, product_id, variant_index, quantity)
            // Join with products (to get basic info)
            // NOTE: We cannot easily get variant label/price directly without parsing JSONB in app layer
            const { data: items, error: itemsError } = await this.supabase
                .from('cart') // Typically cart is user specific, maybe 'shop_cart'? User said ALL tables.
                // However, user said "differentiate between client, admin, and common". Cart is purely client.
                // Keeping 'cart' might be fine, but aiming for consistency 'shop_cart' or 'client_cart'.
                // Let's assume 'shop_cart' for consistency with 'shop_orders'.
                .from('shop_cart')
                .select(`
                    product_id,
                    quantity,
                    variant_index,
                    shop_products (
                        id,
                        name,
                        image_url,
                        category,
                        variants
                    )
                `)
                .eq('user_id', user.id);

            if (itemsError) throw itemsError;

            // Transform to local cart format
            const formattedItems = (items || []).map(item => {
                const product = item.products;
                if (!product) return null;

                let variants = product.variants;
                if (typeof variants === 'string') {
                    try { variants = JSON.parse(variants); } catch (e) { variants = []; }
                }
                if (!Array.isArray(variants)) variants = [];

                const vIndex = item.variant_index;
                const variant = variants[vIndex] || variants[0] || { label: 'Standard', price: 0 };

                return {
                    id: product.id,
                    name: product.name,
                    image: product.image_url,
                    category: product.category,
                    price: variant.price,
                    qty: item.quantity,
                    variantLabel: variant.label,
                    variantIndex: vIndex
                };
            }).filter(i => i !== null);

            return { data: formattedItems, error: null };
        } catch (error) {
            console.error('Error loading cart:', error);
            return { data: [], error: error.message };
        }
    }

    // Save full cart to Supabase
    async saveCart(cartItems) {
        if (!this.supabase) return { error: 'Supabase not initialized' };

        try {
            const { data: { user } } = await this.supabase.auth.getUser();
            if (!user) return { error: 'User not logged in' };

            // 1. Delete all existing items for user (Sync Strategy: Full Rewrite)
            // 1. Delete all existing items for user (Sync Strategy: Full Rewrite)
            const { error: deleteError } = await this.supabase
                .from('shop_cart') // Updated table
                .delete()
                .eq('user_id', user.id);

            if (deleteError) throw deleteError;

            if (cartItems.length === 0) return { error: null };

            // 2. Insert current items
            const itemsToInsert = cartItems.map(item => ({
                user_id: user.id,
                product_id: item.id,
                quantity: item.qty,
                variant_index: item.variantIndex !== undefined ? item.variantIndex : 0
            }));

            const { error: insertError } = await this.supabase
                .from('shop_cart') // Updated table
                .insert(itemsToInsert);

            if (insertError) throw insertError;

            return { error: null };
        } catch (error) {
            console.error('Error saving cart:', error);
            return { error: error.message };
        }
    }

    // --- Promotional Codes ---

    // Validate a promo code against the database
    async validatePromoCode(code) {
        const ready = await this.ensureReady();
        if (!ready) return { data: null, error: 'Supabase not initialized' };

        try {
            console.log('Validating promo code:', code);
            const now = new Date().toISOString();

            // Fetch the promo code details
            const { data, error } = await this.supabase
                .from('shop_promo_codes') // Updated table
                .select('*')
                .eq('code', code.toUpperCase())
                .eq('active', true)
                .lte('valid_from', now)
                .gte('valid_through', now)
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    return { data: null, error: 'Invalid or expired promo code' };
                }
                throw error;
            }

            return { data, error: null };
        } catch (error) {
            console.error('Error validating promo code:', error);
            return { data: null, error: error.message || 'Failed to validate promo code' };
        }
    }
}

// Initialize API helpers
window.apiHelpers = new ApiHelpers();