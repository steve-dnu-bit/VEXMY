/** Parse CSV including quoted commas and newlines; strips UTF-8 BOM. */
export function parseCsvRecords(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = "";
  };
  const pushRow = () => {
    if (row.length > 0 && row.some((c) => c.length > 0)) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        pushField();
      } else if (ch === "\r" && text[i + 1] === "\n") {
        pushField();
        pushRow();
        i++;
      } else if (ch === "\n" || ch === "\r") {
        pushField();
        pushRow();
      } else {
        field += ch;
      }
    }
  }
  pushField();
  pushRow();
  return rows;
}
