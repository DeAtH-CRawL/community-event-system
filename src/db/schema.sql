-- PostgreSQL schema for the community event system
-- Sourced from strict user requirements (Supabase as Source of Truth)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- FAMILIES TABLE (Source of Truth)
-- =============================================================================
-- id: UUID (Standard Supabase pattern)
-- surname: Text
-- head_name: Text
-- phone: Text (nullable, unique-ish but not strictly enforced in DB to allow dirty data)
-- family_size: Integer

CREATE TABLE IF NOT EXISTS families (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    surname TEXT NOT NULL,
    head_name TEXT NOT NULL,
    phone TEXT, -- Can be NULL as per requirements
    family_size INTEGER NOT NULL CHECK (family_size >= 1),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for search performance
CREATE INDEX IF NOT EXISTS idx_families_surname_lower ON families (LOWER(surname));
CREATE INDEX IF NOT EXISTS idx_families_head_name_lower ON families (LOWER(head_name));
CREATE INDEX IF NOT EXISTS idx_families_phone ON families (phone);


-- =============================================================================
-- SERVINGS TABLE (Runtime State)
-- =============================================================================
-- Tracks plates served per family per event.

CREATE TABLE IF NOT EXISTS servings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    family_id UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    plates_used INTEGER NOT NULL DEFAULT 0 CHECK (plates_used >= 0),
    additional_guests INTEGER NOT NULL DEFAULT 0 CHECK (additional_guests >= 0),
    checked_in_at TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_name, family_id)
);

CREATE INDEX IF NOT EXISTS idx_servings_event_name ON servings (event_name);
CREATE INDEX IF NOT EXISTS idx_servings_family_id ON servings (family_id);

-- =============================================================================
-- AUDIT LOGS (Unchanged)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_role TEXT NOT NULL,
    event_name TEXT NOT NULL,
    family_id UUID REFERENCES families(id) ON DELETE SET NULL, -- Changed to UUID type
    action_type TEXT NOT NULL,
    before_value JSONB,
    after_value JSONB,
    details TEXT,
    station_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
