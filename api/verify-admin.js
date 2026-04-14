const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zbgljlughkavbzueopjx.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'sb_publishable_otdTGesO-mgeHQuXHIVZcA_ZluiPs3b';
const supabase = createClient(supabaseUrl, supabaseUrl === 'undefined' ? '' : supabaseKey);

module.exports = async (req, res) => {
    // Basic CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');

    const clientIpHeader = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientIp = clientIpHeader.split(',')[0].trim();

    try {
        const { data: allowedIps } = await supabase.from('allowed_ips').select('ip_address');
        
        // If no IPs are in the table, we assume no restriction is active yet
        if (!allowedIps || allowedIps.length === 0) {
            res.status(200).json({ status: "authorized", message: "No restrictions active" });
            return;
        }

        const isAllowed = allowedIps.some(item => item.ip_address === clientIp);
        
        if (isAllowed) {
            res.status(200).json({ status: "authorized" });
        } else {
            res.status(403).json({ status: "forbidden" });
        }
    } catch (err) {
        res.status(500).json({ error: "Server Error" });
    }
};
