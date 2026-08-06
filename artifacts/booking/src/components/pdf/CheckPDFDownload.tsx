/**
 * CheckPDFDownload — lazy wrapper around @react-pdf/renderer's PDFDownloadLink.
 *
 * Loaded only on the client (via React.lazy / Suspense in the parent) so
 * @react-pdf/renderer's heavy bundle doesn't block the initial render.
 */
import { PDFDownloadLink } from "@react-pdf/renderer";
import { CheckDocumentPDF, type CheckPDFProps } from "./CheckDocumentPDF";
import { Download } from "lucide-react";

export type CheckPDFDownloadProps = CheckPDFProps & {
  filename?: string;
};

export function CheckPDFDownload({ filename, ...props }: CheckPDFDownloadProps) {
  const defaultFilename = `check-${props.checkNumber}-${props.payee.replace(/\s+/g, "-").toLowerCase()}.pdf`;

  return (
    <PDFDownloadLink
      document={<CheckDocumentPDF {...props} />}
      fileName={filename ?? defaultFilename}
    >
      {({ loading, error }) => (
        <button
          disabled={loading || !!error}
          title={error ? "PDF generation failed" : "Download check as PDF"}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
        >
          <Download className="h-4 w-4" />
          {loading ? "Generating…" : error ? "PDF error" : "Download PDF"}
        </button>
      )}
    </PDFDownloadLink>
  );
}
