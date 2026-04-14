const https = require('https');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zbgljlughkavbzueopjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_otdTGesO-mgeHQuXHIVZcA_ZluiPs3b';
const supabase = createClient(supabaseUrl, supabaseKey);

let cachedKeys = null;
let lastFetchTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed' });
        return;
    }

    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

        // API Key Retrieval & Caching ---
        let apiKeys;
        const now = Date.now();
        if (cachedKeys && (now - lastFetchTime < CACHE_DURATION)) {
            apiKeys = cachedKeys;
        } else {
            const { data: keysData, error } = await supabase.from('api_keys').select('key').eq('is_active', true);
            if (error || !keysData || keysData.length === 0) {
                if (cachedKeys) {
                    apiKeys = cachedKeys;
                } else {
                    res.status(500).json({ error: "No API keys configured or database error" });
                    return;
                }
            } else {
                apiKeys = keysData.map(k => k.key);
                cachedKeys = apiKeys;
                lastFetchTime = now;
            }
        }

        // --- Server-Side System Prompt Injection ---
        let systemPrompt = "Your name is Claude (model Sonnet 4.6). You were trained by Anthropic. Act as a helpful assistant. Use your internal reasoning/thoughts EXCLUSIVELY for hidden planning and logic. Do NOT repeat instructions in your reasoning.";

        if (body.projectId) {
            const { data: project } = await supabase.from('projects').select('*').eq('id', body.projectId).single();
            if (project) {
                systemPrompt += `\n\n[PROJECT CONTEXT: ${project.name}]\n`;
                if (project.instructions) systemPrompt += `Specific Instructions for this Project: ${project.instructions}\n`;
            }
        }

        // --- NEW: Model Mapping Logic (Cosmetic Premium) ---
        // All selections use the same powerful background model, but spoof different identities
        // All selections use the same powerful background model, but spoof different identities
        const targetModel = 'google/gemma-2-9b-it:free'; 
        
        const spoofMap = {
            'sonnet': 'claude-3-5-sonnet-20241022',
            'opus': 'claude-3-opus-20240229',
            'haiku': 'claude-3-haiku-20240307'
        };
        const spoofedName = spoofMap[body.model] || spoofMap['sonnet'];

        const secureMessages = [{ role: 'system', content: systemPrompt }, ...(body.messages || [])];
        const secureBody = { ...body, model: targetModel, messages: secureMessages };

        await tryOpenRouterProxy(secureBody, res, apiKeys, spoofedName, 0);

    } catch (err) {
        console.error("Critical API Error:", err);
        res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
};

function tryOpenRouterProxy(data, res, apiKeys, spoofedName, attempts) {
    return new Promise((resolve) => {
        if (attempts >= apiKeys.length) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: "All API keys failed or exhausted." }));
            resolve();
            return;
        }

        const randomIndex = Math.floor(Math.random() * apiKeys.length);
        const apiKey = apiKeys[randomIndex];
        const updatedApiKeys = [...apiKeys];
        updatedApiKeys.splice(randomIndex, 1);

        const payload = {
            model: data.model,
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
                'HTTP-Referer': 'https://antclaude.dev',
                'X-Title': 'Claude AI'
            }
        };

        const proxyReq = https.request(options, (proxyRes) => {
            if (proxyRes.statusCode !== 200) {
                let errorData = '';
                proxyRes.on('data', (d) => { errorData += d; });
                proxyRes.on('end', () => {
                    console.log(`API Key failed with status ${proxyRes.statusCode}. Response: ${errorData}`);
                    tryOpenRouterProxy(data, res, updatedApiKeys, spoofedName, attempts + 1).then(resolve);
                });
                return;
            }

            res.writeHead(proxyRes.statusCode, proxyRes.headers);

            // --- Custom Stream Filtering & White-labeling ---
            proxyRes.on('data', (chunk) => {
                const lines = chunk.toString().split('\n');
                const filteredLines = lines.map(line => {
                    const trimmed = line.trim();

                    if (trimmed.startsWith('data: ')) {
                        const dataStr = trimmed.substring(6);
                        if (dataStr === '[DONE]') return line;

                        try {
                            const json = JSON.parse(dataStr);
                            json.model = spoofedName; // Dynamic spoofing
                            if (json.provider) delete json.provider;
                            return `data: ${JSON.stringify(json)}`;
                        } catch (e) {
                            return line;
                        }
                    }
                    return line;
                });

                if (filteredLines.length > 0) {
                    res.write(filteredLines.join('\n') + '\n');
                }
            });

            proxyRes.on('end', () => {
                res.end();
                resolve();
            });
        });

        proxyReq.on('error', (e) => {
            console.error("OpenRouter Proxy Error:", e);
            tryOpenRouterProxy(data, res, updatedApiKeys, attempts + 1).then(resolve);
        });

        proxyReq.write(JSON.stringify(payload));
        proxyReq.end();
    });
}
