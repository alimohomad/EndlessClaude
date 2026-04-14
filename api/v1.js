const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zbgljlughkavbzueopjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    const authHeader = req.headers.authorization;
    const apiKey = authHeader ? authHeader.replace('Bearer ', '') : req.query.key;

    if (!apiKey) {
        return res.status(401).json({ error: "Missing API Key. Provide via ?key= or Authorization: Bearer" });
    }

    try {
        // Validate Key
        const { data: keyRecord, error } = await supabase
            .from('user_api_keys')
            .select('*')
            .eq('api_key', apiKey)
            .eq('is_active', true)
            .single();

        if (error || !keyRecord) {
            return res.status(403).json({ error: "Invalid or inactive API key." });
        }

        // Increment Usage
        await supabase
            .from('user_api_keys')
            .update({ usage_count: (keyRecord.usage_count || 0) + 1, last_used: new Date() })
            .eq('id', keyRecord.id);

        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Forward to the main chat logic
        // We'll call the internal chat logic directly
        const chatModule = require('./chat');
        return chatModule(req, res);

    } catch (err) {
        console.error("V1 API Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
};
