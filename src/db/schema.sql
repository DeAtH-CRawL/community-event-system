-- PostgreSQL schema for the community event system
-- Families represent households, events define coupon rules,
-- and event_entries track each family's attendance and coupon usage.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surname TEXT NOT NULL,
    head_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    family_size INTEGER NOT NULL CHECK (family_size >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast searching (non-unique as requested)
CREATE INDEX IF NOT EXISTS idx_families_surname ON families (surname);
CREATE INDEX IF NOT EXISTS idx_families_head_name ON families (head_name);
CREATE INDEX IF NOT EXISTS idx_families_phone ON families (phone);

CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    coupons_per_member INTEGER NOT NULL CHECK (coupons_per_member >= 0),
    guest_coupon_price NUMERIC(10, 2) NOT NULL CHECK (guest_coupon_price >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS event_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES families (id) ON DELETE CASCADE,
    members_present INTEGER NOT NULL CHECK (members_present >= 0),
    guest_count INTEGER NOT NULL CHECK (guest_count >= 0),
    member_coupons INTEGER NOT NULL CHECK (member_coupons >= 0),
    guest_coupons INTEGER NOT NULL CHECK (guest_coupons >= 0),
    total_coupons INTEGER NOT NULL CHECK (total_coupons >= 0),
    remaining_coupons INTEGER NOT NULL CHECK (remaining_coupons >= 0),
    status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'FOOD_EXHAUSTED', 'CLOSED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (event_id, family_id)
);

CREATE INDEX IF NOT EXISTS idx_event_entries_event_id ON event_entries (event_id);
CREATE INDEX IF NOT EXISTS idx_event_entries_family_id ON event_entries (family_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_role TEXT NOT NULL, -- 'volunteer', 'admin'
    event_id UUID REFERENCES events(id),
    family_id UUID REFERENCES families(id),
    action_type TEXT NOT NULL, -- 'CHECK_IN', 'CONSUME', 'ADJUST', 'CLOSE', 'REOPEN'
    before_value JSONB,
    after_value JSONB,
    details TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_id ON audit_logs (event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_family_id ON audit_logs (family_id);
