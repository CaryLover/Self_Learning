const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'";
const META = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;

/** The sandbox blocks scripts; CSP also prevents the document loading remote resources. */
export function protectExplainDocument(html: string): string {
  const doctype = html.match(/^\s*<!doctype\s+html\s*>/i);
  if (!doctype) return META + html;
  return html.slice(0, doctype[0].length) + META + html.slice(doctype[0].length);
}
