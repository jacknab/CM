/**
 * Single entry point for /review/:id, replacing two separately-registered
 * routes (/review/:token and /review/:appointmentId) that were structurally
 * identical path shapes — React Router can't reliably disambiguate two
 * single-dynamic-segment routes at the same path depth, so whichever won was
 * an accident of declaration order, not a real routing decision. This
 * component removes the ambiguity by branching on the param's shape itself:
 * appointment ids are always numeric; review tokens are 48-character hex
 * strings (crypto.randomBytes(24).toString("hex") in reviewLinks.ts) and
 * never match that pattern.
 */
import { useParams } from "react-router-dom";
import ReviewSubmit from "@/pages/ReviewSubmit";
import ReviewGate from "@/pages/public-review/ReviewGate";

export default function ReviewEntry() {
  const { id } = useParams<{ id: string }>();
  return /^\d+$/.test(id ?? "") ? <ReviewSubmit /> : <ReviewGate />;
}
