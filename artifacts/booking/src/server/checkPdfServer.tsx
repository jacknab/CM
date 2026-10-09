/**
 * Server-side entry for the check PDF: renders the SAME document the browser's "Download PDF" uses
 * (components/pdf/CheckDocumentPDF.tsx), so a check printed through the Certxa Print Agent is
 * identical to one downloaded from Print Checks.
 *
 * Not part of the web app bundle. api-server/build.mjs bundles this file for Node as
 * booking/dist-server/checkPdfServer.mjs (next to the booking app's node_modules, which hold
 * @react-pdf/renderer and react), and api-server/src/routes/printAgent.ts loads it at runtime.
 */
import { renderToBuffer } from "@react-pdf/renderer";
import { CheckDocumentPDF, type CheckPDFProps } from "@/components/pdf/CheckDocumentPDF";

export async function renderCheckPdf(props: CheckPDFProps) {
  return renderToBuffer(<CheckDocumentPDF {...props} />);
}
