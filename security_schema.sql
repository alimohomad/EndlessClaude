-- Create a table to store allowed IP addresses for administrative access
CREATE TABLE allowed_ips (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address TEXT NOT NULL UNIQUE,
    label TEXT, -- e.g., 'Master Admin IP'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE allowed_ips ENABLE ROW LEVEL SECURITY;

-- Only allow service role (backend) to read this for now
CREATE POLICY "Strict backend only access" ON allowed_ips
FOR SELECT USING (false); 

-- NEW: Table for User-Generated API Keys
CREATE TABLE user_api_keys (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    api_key TEXT NOT NULL UNIQUE,
    label TEXT, -- e.g. 'My Personal App'
    is_active BOOLEAN DEFAULT true,
    usage_count INTEGER DEFAULT 0,
    last_used TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE user_api_keys ENABLE ROW LEVEL SECURITY;

-- Users can read their own keys
CREATE POLICY "Users can view own keys" ON user_api_keys
FOR SELECT USING (auth.uid() = user_id);
