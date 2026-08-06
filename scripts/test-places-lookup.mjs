/**
 * test-places-lookup.mjs
 * Quick smoke-test for the Google Places address-lookup used in onboarding.
 *
 * Usage:
 *   node scripts/test-places-lookup.mjs
 *
 * Expected result: business name should be "Luxury Nails"
 */

const GOOGLE_PLACES_API_KEY =
  process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_PLACES_API_KEY) {
  console.error("✗ GOOGLE_PLACES_API_KEY is not set. Add it as a Replit Secret.");
  process.exit(1);
}

// ── Test case ──────────────────────────────────────────────────────────────
const streetAddr  = "4635 E Speedway Blvd";
const city        = "Tucson";
const state       = "AZ";
const zip         = "85712";
const businessType = "Nail Salon";
const expected    = "Luxury Nails";

const fullAddr = `${streetAddr}, ${city}, ${state} ${zip}`;
const query    = `${businessType} ${fullAddr}`;

console.log("Searching Google Places for:", query);
console.log("─".repeat(60));

const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_PLACES_API_KEY}`;

const resp = await fetch(url);
const data = await resp.json();

if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
  console.error("✗ Places API error:", data.status, data.error_message ?? "");
  process.exit(1);
}

const results = (data.results ?? []).map(r => ({ name: r.name, address: r.formatted_address }));

if (results.length === 0) {
  console.warn("⚠ No results returned. Check that the API key has Places API enabled and billing is active.");
  process.exit(1);
}

console.log("Top results:");
results.slice(0, 5).forEach((r, i) => console.log(`  ${i + 1}. ${r.name}  —  ${r.address}`));
console.log();

// Filter out results whose name looks like a street address (starts with digit)
const match = results.find(r => !/^\d/.test(r.name.trim()));

if (!match) {
  console.error("✗ All results look like street addresses — no business name found.");
  process.exit(1);
}

if (match.name === expected) {
  console.log(`✓ PASS — First business name: "${match.name}" matches expected "${expected}"`);
} else {
  console.warn(`⚠ First business name: "${match.name}" — expected "${expected}"`);
  console.warn("  This may be correct if the salon name changed on Google Maps, or a different business is at this address.");
}
