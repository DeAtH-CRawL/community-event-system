# Google Sheets → Supabase Sync Setup

## Overview
This system treats **Google Sheets as the source of truth** for family data. Supabase is a read-only runtime mirror for speed and offline resilience.

---

## Required NPM Packages

```bash
npm install googleapis
```

---

## Environment Variables

Ensure these exist in `.env.local`:

```env
GOOGLE_SHEETS_ID=your-sheet-id-here
GOOGLE_SHEETS_API_KEY=your-google-api-key-here
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
```

### How to get Google Sheets API Key:
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable "Google Sheets API"
4. Go to "Credentials" → "Create Credentials" → "API Key"
5. **Restrict the key**: Only allow "Google Sheets API"
6. Copy the key into `.env.local`

### How to get Sheet ID:
From your Google Sheets URL:
```
https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0/edit
                                      ^^^^^^^^^^^^^^^^^^^
                                      This is the Sheet ID
```

---

## Google Sheets Format

**Row 1 must be headers** (exact names don't matter, but column order does):

| A       | B         | C     | D           | E     |
|---------|-----------|-------|-------------|-------|
| Surname | Head Name | Phone | Family Size | Notes |

**Data starts from Row 2:**

| A     | B      | C           | D | E           |
|-------|--------|-------------|---|-------------|
| Shah  | Rakesh | 9811234567  | 4 | VIP Family  |
| Patel | Priya  | 9822345678  | 3 |             |

### Critical Rules:
- **Phone MUST be unique** (it's the primary identifier)
- **Phone cannot be empty** (rows without phone are skipped)
- **Family Size must be ≥ 1**

---

## SQL Indexes (Already Created)

The following indexes exist in `schema.sql` for performance:

```sql
CREATE INDEX IF NOT EXISTS idx_families_surname_lower ON families (LOWER(surname));
CREATE INDEX IF NOT EXISTS idx_families_head_name_lower ON families (LOWER(head_name));
CREATE INDEX IF NOT EXISTS idx_families_phone ON families (phone);
```

No additional SQL needed.

---

## Testing the Sync

### Method 1: Admin Panel (Recommended)
1. Start dev server: `npm run dev`
2. Navigate to `/admin`
3. Click "Sync from Sheet" button
4. Check the stats displayed

### Method 2: Direct API Call
```bash
curl -X POST http://localhost:3000/api/sync-families
```

Expected response:
```json
{
  "success": true,
  "stats": {
    "total": 10,
    "inserted": 3,
    "updated": 7,
    "skipped": 0,
    "errors": 0
  },
  "errors": [],
  "timestamp": "2024-01-23T03:30:00.000Z"
}
```

### Method 3: Production Test
```bash
curl -X POST https://your-domain.vercel.app/api/sync-families
```

---

## How Non-Technical Users Update Data

### ✅ CORRECT Process:
1. **Edit the Google Sheet** (add/update/delete rows)
2. **Save changes** (Google Sheets auto-saves)
3. **Click "Sync from Sheet"** in Admin Panel
4. **Verify** the family count matches

### ❌ ANTI-PATTERNS (Do NOT do this):
- ❌ Editing Supabase database directly
- ❌ Running SQL `INSERT` commands manually
- ❌ Creating families via app UI (not implemented)
- ❌ Syncing during live event (sync BEFORE event starts)

---

## Why This Architecture is Safer

### Problem: Direct Database Editing
- ❌ Non-technical users break SQL syntax
- ❌ Duplicate UUIDs created
- ❌ Foreign key constraints violated
- ❌ No version history

### Solution: Google Sheets as Source of Truth
- ✅ Familiar spreadsheet interface
- ✅ Built-in version history (File → Version history)
- ✅ Collaborative editing with Google permissions
- ✅ Easy to audit changes
- ✅ Can rollback to previous versions
- ✅ Syncing is idempotent (safe to retry)

### Live Event Safety
During events (crowd surges, disputes):
- **Supabase handles fast reads** (volunteers search/serve instantly)
- **No Google Sheets API calls** at runtime (offline-safe)
- **All writes go to Supabase** (servings, check-ins, audit logs)
- **Dispute resolution uses audit logs** (immutable)

---

## Sync Behavior (Idempotency Guarantee)

### First Sync
- Sheet has 3 families
- Supabase is empty
- **Result**: 3 inserted, 0 updated

### Second Sync (no changes)
- Sheet still has 3 families
- Supabase has 3 families
- **Result**: 0 inserted, 3 updated (phone match → update timestamp)

### Third Sync (1 new family)
- Sheet now has 4 families
- Supabase has 3 families
- **Result**: 1 inserted, 3 updated

### Fourth Sync (1 family deleted from sheet)
- Sheet now has 3 families
- Supabase has 4 families
- **Result**: 0 inserted, 3 updated
- **Note**: Orphaned record remains in Supabase (by design for audit trail)

---

## Troubleshooting

### Error: "Missing GOOGLE_SHEETS_ID"
- Check `.env.local` exists in project root
- Restart dev server after editing `.env.local`

### Error: "The caller does not have permission"
- API key is not restricted correctly
- Go to Google Cloud Console → Credentials → Edit API Key
- Ensure only "Google Sheets API" is enabled

### Error: "Invalid phone"
- Some rows have empty phone column
- Fix: Add phone numbers or remove those rows

### Sync shows 0 total rows
- Check if Sheet1 is the correct tab name
- Check if data starts from row 2 (row 1 = headers)
- Check `.env.local` has correct GOOGLE_SHEETS_ID

---

## Operational Checklist

### Before Event:
- [ ] Update Google Sheet with latest family data
- [ ] Run sync via Admin Panel
- [ ] Verify family count matches Sheet
- [ ] Test search for a few sample families
- [ ] Backup Supabase database (Supabase Dashboard → Database → Backups)

### During Event:
- [ ] Do NOT sync (Supabase is runtime source)
- [ ] Use Entry Gate for check-ins
- [ ] Use Food Counter for serving
- [ ] Monitor audit logs for disputes

### After Event:
- [ ] Export audit logs (for records)
- [ ] Optional: Sync again if Sheet was updated with corrections
- [ ] Reset event (Admin Panel → Reset Event) for next event
