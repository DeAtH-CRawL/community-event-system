-- PostgreSQL schema for the refactored community event system
-- 
-- ARCHITECTURE:
-- - families: Synced from Google Sheets (family master data)
-- - servings: Runtime state tracking plates used per family per event
-- - audit_logs: Unchanged from previous version
--
-- Users NEVER touch this database directly. They edit Google Sheets.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- FAMILIES TABLE (synced from Google Sheets)
-- =============================================================================
-- This table is populated by the "Sync from Sheet" action.
-- It is an atomic replacement - all rows deleted and re-inserted on sync.
--
-- IMPORTANT: family_id is a manual stable ID from the sheet (e.g., "F001"),
-- NOT a UUID, NOT a row number. This allows users to sort/filter the sheet
-- without breaking references.

CREATE TABLE IF NOT EXISTS families (
    family_id TEXT PRIMARY KEY,           -- Manual stable ID from sheet (e.g., "F001")
    family_name TEXT NOT NULL,            -- Surname
    head_name TEXT NOT NULL,              -- Head of household
    phone TEXT NOT NULL,                  -- Phone number
    members_count INTEGER NOT NULL CHECK (members_count >= 1),  -- = plates_entitled
    notes TEXT,                           -- Optional admin notes
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast case-insensitive search
-- Using LOWER() for proper ILIKE performance
CREATE INDEX IF NOT EXISTS idx_families_family_name_lower ON families (LOWER(family_name));
CREATE INDEX IF NOT EXISTS idx_families_head_name_lower ON families (LOWER(head_name));
CREATE INDEX IF NOT EXISTS idx_families_phone ON families (phone);


-- =============================================================================
-- SERVINGS TABLE (runtime event state)
-- =============================================================================
-- Tracks how many plates have been served to each family for each event.
-- This is the ONLY runtime state we need to track.
--
-- plates_remaining = families.members_count - servings.plates_used
-- Block serving when plates_remaining = 0

CREATE TABLE IF NOT EXISTS servings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,             -- Event identifier (e.g., "Community Dinner 2024")
    family_id TEXT NOT NULL REFERENCES families(family_id) ON DELETE CASCADE,
    plates_used INTEGER NOT NULL DEFAULT 0 CHECK (plates_used >= 0),
    checked_in_at TIMESTAMP WITH TIME ZONE,  -- NULL means not checked in yet
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_name, family_id)         -- One serving record per family per event
);

CREATE INDEX IF NOT EXISTS idx_servings_event_name ON servings (event_name);
CREATE INDEX IF NOT EXISTS idx_servings_family_id ON servings (family_id);


-- =============================================================================
-- AUDIT LOGS TABLE (unchanged from previous version)
-- =============================================================================
-- Tracks all actions for dispute resolution and debugging.

CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_role TEXT NOT NULL,             -- 'volunteer', 'admin'
    event_name TEXT NOT NULL,             -- Event name (not ID, for human readability)
    family_id TEXT REFERENCES families(family_id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,            -- 'SYNC', 'CHECK_IN', 'SERVE', 'ADJUST', 'RESET'
    before_value JSONB,
    after_value JSONB,
    details TEXT,                         -- Human-readable description
    station_id TEXT,                      -- Optional: which device/station performed this
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_name ON audit_logs (event_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_family_id ON audit_logs (family_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);


-- =============================================================================
-- MIGRATION: Drop old tables if they exist
-- =============================================================================
-- Run these manually if migrating from old schema:
--
-- DROP TABLE IF EXISTS event_entries CASCADE;
-- DROP TABLE IF EXISTS events CASCADE;
-- Then rename the old families table or migrate data to Google Sheets first.
