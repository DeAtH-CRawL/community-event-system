/**
 * Google Sheets Integration Module
 * 
 * Fetches family data for SYNC operations only.
 * Does NOT replace the database IDs.
 */

export type SheetRow = {
  surname: string;
  head_name: string;
  phone: string | null;
  family_size: number;
  notes?: string;
};

/**
 * Fetch all families from Google Sheets
 * Maps columns:
 * A: surname
 * B: head_name
 * C: phone
 * D: family_size
 * E: notes
 */
export async function fetchFamiliesFromSheet(): Promise<{
  rows: SheetRow[];
  errors: string[];
}> {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;

  if (!sheetId || !apiKey) {
    return {
      rows: [],
      errors: ['Missing GOOGLE_SHEETS_ID or GOOGLE_SHEETS_API_KEY'],
    };
  }

  // Fetch Sheet1!A2:E
  const range = 'Sheet1!A2:E';
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;

  try {
    const response = await fetch(url, { cache: 'no-store' });

    if (!response.ok) {
      const text = await response.text();
      return { rows: [], errors: [`API Error ${response.status}: ${text}`] };
    }

    const data = await response.json();
    const rawRows = data.values || [];

    const rows: SheetRow[] = [];
    const errors: string[] = [];

    rawRows.forEach((row: any[], index: number) => {
      const rowNum = index + 2;

      const surname = String(row[0] || '').trim();
      const head_name = String(row[1] || '').trim();
      const phoneRaw = String(row[2] || '').trim();
      const sizeRaw = row[3];
      const notes = row[4] ? String(row[4]).trim() : undefined;

      // Skip empty rows
      if (!surname && !head_name) return;

      if (!surname) {
        errors.push(`Row ${rowNum}: Missing Surname`);
        return;
      }
      if (!head_name) {
        errors.push(`Row ${rowNum}: Missing Head Name`);
        return;
      }

      const family_size = Number(sizeRaw);
      if (isNaN(family_size) || family_size < 1) {
        errors.push(`Row ${rowNum}: Invalid Size '${sizeRaw}'`);
        return;
      }

      rows.push({
        surname,
        head_name,
        phone: phoneRaw || null, // Handle empty phone as null
        family_size,
        notes,
      });
    });

    return { rows, errors };

  } catch (error) {
    return { rows: [], errors: [String(error)] };
  }
}
