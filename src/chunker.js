// Splits the handbook markdown into sections and numbered paragraphs.
// Every paragraph keeps its id ("26.3") so an answer can always point back to its source.

export function parseHandbook(md) {
  const sections = [];
  let current = null;
  let title = "";
  for (const line of md.split(/\r?\n/)) {
    if (/^# /.test(line)) { title = line.slice(2).trim(); continue; }
    const h = /^## (\d+)\.\s+(.*)$/.exec(line);
    if (h) { current = { id: h[1], title: h[2].trim(), paragraphs: [] }; sections.push(current); continue; }
    const p = /^(\d+)\.(\d+)\s+(.*)$/.exec(line);
    if (p && current && p[1] === current.id) {
      current.paragraphs.push({ id: `${p[1]}.${p[2]}`, sectionId: current.id, sectionTitle: current.title, text: p[3].trim() });
    }
  }
  return { title, sections, paragraphs: sections.flatMap((s) => s.paragraphs) };
}
