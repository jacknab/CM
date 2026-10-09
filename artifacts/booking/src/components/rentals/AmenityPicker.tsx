import { useState } from "react";
import { X } from "lucide-react";
import { SUGGESTED_SPACE_AMENITIES } from "@shared/rentalSpaces";

/** Chip multi-select over a curated suggestion list, plus a freeform "add" input — the column itself is an unconstrained string array. */
export default function AmenityPicker({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const [customInput, setCustomInput] = useState("");

  const toggle = (amenity: string) => {
    onChange(value.includes(amenity) ? value.filter((a) => a !== amenity) : [...value, amenity]);
  };

  const addCustom = () => {
    const trimmed = customInput.trim();
    if (trimmed && !value.includes(trimmed)) onChange([...value, trimmed]);
    setCustomInput("");
  };

  const customSelected = value.filter((a) => !(SUGGESTED_SPACE_AMENITIES as readonly string[]).includes(a));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_SPACE_AMENITIES.map((amenity) => {
          const active = value.includes(amenity);
          return (
            <button
              key={amenity}
              type="button"
              onClick={() => toggle(amenity)}
              className={`rounded-full border px-2.5 py-1 text-[12px] font-medium transition ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300"
              }`}
            >
              {amenity}
            </button>
          );
        })}
        {customSelected.map((amenity) => (
          <button
            key={amenity}
            type="button"
            onClick={() => toggle(amenity)}
            className="flex items-center gap-1 rounded-full border border-neutral-900 bg-neutral-900 px-2.5 py-1 text-[12px] font-medium text-white"
          >
            {amenity}
            <X size={11} />
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addCustom(); }
          }}
          placeholder="Add another amenity…"
          className="w-full max-w-[220px] rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-[12px] text-neutral-800 outline-none focus:border-neutral-400"
        />
      </div>
    </div>
  );
}
