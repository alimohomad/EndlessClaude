const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    'https://zbgljlughkavbzueopjx.supabase.co',
    'sb_publishable_otdTGesO-mgeHQuXHIVZcA_ZluiPs3b'
);

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
        
        // Fetch API keys from Supabase (Requires RLS to either be off for api_keys or allowed to read)
        const { data: keysData, error } = await supabase
            .from('api_keys')
            .select('key')
            .eq('is_active', true);

        if (error || !keysData || keysData.length === 0) {
            console.error("Supabase Key Fetch Error: ", error);
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

        const apiKey = apiKeys[attempts];

        const payload = {
            model: data.model || "minimax/minimax-m2.5:free",
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
                console.log(`API Key ${attempts + 1}/${apiKeys.length} failed with status ${proxyRes.statusCode}. Retrying...`);
                proxyRes.on('data', () => {}); 
                tryOpenRouterProxy(data, res, apiKeys, attempts + 1).then(resolve);
                return;
            }

            res.writeHead(proxyRes.statusCode, proxyRes.headers);
            proxyRes.pipe(res);
            proxyRes.on('end', () => resolve());
        });

        proxyReq.on('error', (e) => {
            console.error("OpenRouter Proxy Error:", e);
            tryOpenRouterProxy(data, res, apiKeys, attempts + 1).then(resolve);
        });

        proxyReq.write(JSON.stringify(payload));
        proxyReq.end();
    });
}
