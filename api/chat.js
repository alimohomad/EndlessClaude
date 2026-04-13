const https = require('https');
const { createClient } = require('@supabase/supabase-js');

// Create Supabase client using Service Role Key from environment variable to securely bypass RLS
// We fallback to the anon key just in case, but warn that it will fail without RLS policies
const supabaseUrl = 'https://zbgljlughkavbzueopjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_otdTGesO-mgeHQuXHIVZcA_ZluiPs3b';
const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = async (req, res) => {
    // Enable CORS for Vercel
    res.setHeader('Access-Control-Allow-Credentials', true)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT')
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    )

    if (req.method === 'OPTIONS') {
        res.status(200).end()
        return
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        
        // Fetch securely from Supabase
        const { data: keysData, error } = await supabase
            .from('api_keys')
            .select('key')
            .eq('is_active', true);

        if (error || !keysData || keysData.length === 0) {
            console.error("Supabase Key Fetch Error (Make sure SUPABASE_SERVICE_ROLE_KEY is set in Vercel): ", error);
            res.status(500).json({ error: "No API keys configured or database error" });
            return;
        }

        const apiKeys = keysData.map(k => k.key);

        await tryOpenRouterProxy(body, res, apiKeys, 0);

    } catch (err) {
        console.error("Parse error:", err);
        res.status(400).send("Invalid Request");
    }
};

function tryOpenRouterProxy(data, res, apiKeys, attempts) {
    return new Promise((resolve) => {
        if (attempts >= apiKeys.length) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "All API keys failed or exhausted." }));
            resolve();
            return;
        }

        // Randomly select an API key to distribute load (as requested by user)
        const randomIndex = Math.floor(Math.random() * apiKeys.length);
        const apiKey = apiKeys[randomIndex];
        
        // Remove the key we just tried from the array so we don't try it again during fallback
        const updatedApiKeys = [...apiKeys];
        updatedApiKeys.splice(randomIndex, 1);

        const payload = {
            model: data.model || "nvidia/nemotron-3-super-120b-a12b:free",
            messages: data.messages,
            stream: true
        };

        const options = {
            hostname: 'openrouter.ai',
            path: '/api/v1/chat/completions',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://endless-claude.vercel.app',
                'X-Title': 'Claude AI'
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            if (proxyRes.statusCode !== 200) {
                console.log(`API Key failed with status ${proxyRes.statusCode}. Retrying with another random key...`);
                proxyRes.on('data', () => {}); 
                tryOpenRouterProxy(data, res, updatedApiKeys, attempts + 1).then(resolve);
                return;
            }

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
            proxyRes.on('end', () => resolve());
        });

        proxyReq.on('error', (e) => {
            console.error("OpenRouter Proxy Error:", e);
            tryOpenRouterProxy(data, res, updatedApiKeys, attempts + 1).then(resolve);
        });

        proxyReq.write(JSON.stringify(payload));
        proxyReq.end();
    });
}
