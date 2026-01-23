/**
 * Google Sheets Integration Module
 * 
 * Fetches family master data from a Google Sheet.
 * This is a READ-ONLY integration - users edit the sheet directly.
 * 
 * Sheet Schema (must match exactly):
 * Column A: family_id (manual stable ID, e.g., "F001")
 * Column B: family_name (surname)
 * Column C: head_name (head of household)
 * Column D: phone (phone number)
 * Column E: members_count (number, plates entitled)
 * Column F: notes (optional)
 */

export type SheetFamily = {
  family_id: string;
  family_name: string;
  head_name: string;
  phone: string;
  members_count: number;
  notes?: string;
};

type SheetRow = (string | number | null | undefined)[];

/**
 * Fetch all families from Google Sheets
 * Uses the Google Sheets API v4 with API key authentication
 */
export async function fetchFamiliesFromSheet(): Promise<{
  families: SheetFamily[];
  errors: string[];
}> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

  if (!sheetId || !apiKey) {
    return {
      families: [],
      errors: ['Missing GOOGLE_SHEETS_ID or GOOGLE_SHEETS_API_KEY in environment'],
    };
  }

  // Fetch data from Sheet1, columns A-F, starting from row 2 (skip header)
  const range = 'Sheet1!A2:F';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      const errorText = await response.text();
      return {
        families: [],
        errors: [`Google Sheets API error: ${response.status} - ${errorText}`],
      };
    }

    const data = await response.json();
    const rows: SheetRow[] = data.values || [];

    const families: SheetFamily[] = [];
    const errors: string[] = [];

    rows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 because row 1 is header, index is 0-based

      // Extract values (columns A-F)
      const family_id = String(row[0] || '').trim();
      const family_name = String(row[1] || '').trim();
      const head_name = String(row[2] || '').trim();
      const phone = String(row[3] || '').trim();
      const members_count_raw = row[4];
      const notes = row[5] ? String(row[5]).trim() : undefined;

      // Validation: family_id is required
      if (!family_id) {
        errors.push(`Row ${rowNumber}: Missing family_id (column A)`);
        return;
      }

      // Validation: family_name is required
      if (!family_name) {
        errors.push(`Row ${rowNumber}: Missing family_name (column B)`);
        return;
      }

      // Validation: head_name is required
      if (!head_name) {
        errors.push(`Row ${rowNumber}: Missing head_name (column C)`);
        return;
      }

      // Validation: phone is required
      if (!phone) {
        errors.push(`Row ${rowNumber}: Missing phone (column D)`);
        return;
      }

      // Validation: members_count must be a positive number
      const members_count = Number(members_count_raw);
      if (isNaN(members_count) || members_count < 1) {
        errors.push(`Row ${rowNumber}: Invalid members_count (column E) - must be a number >= 1`);
        return;
      }

      families.push({
        family_id,
        family_name,
        head_name,
        phone,
        members_count,
        notes,
      });
    });

    return { families, errors };
  } catch (error) {
    return {
      families: [],
      errors: [`Failed to fetch from Google Sheets: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}
