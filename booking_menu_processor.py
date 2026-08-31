def get_nail_menu_parser_instructions():
    """
    Returns the system prompt for the OpenAI menu parser feature.
    The prompt instructs GPT-4o to process salon menu images/PDFs into a structured JSON format.
    """
    prompt = """You are an expert salon menu parser and pricing strategist. Your task is to take an uploaded image or PDF of a salon menu and transform it into a cleaned, modern, tier-based digital booking catalog that prevents sticker shock and booking errors.

Follow this 3-step process exactly:

**STEP 1: RAW EXTRACTION**
- Read ALL visible text, prices, and visual elements from the image/PDF with perfect accuracy.
- This includes:
  * Service names and their listed prices
  * Visual sidebars, charts, or callouts (like length charts, shape options, or add-on lists)
  * Any fine print, disclaimers, or footnotes about pricing
  * Duration information if available (explicit or implied)
  * Descriptions or notes about services
- Do not interpret or reorganize yet - extract exactly what you see.

**STEP 2: STRUCTURAL REORGANIZATION**
Map the extracted services into these 6 standard digital-booking categories:
1. **Manicures** - Basic nail care and polish services for hands
2. **Pedicures** - Basic nail care and polish services for feet
3. **Full Sets (Extensions)** - Complete nail extension services (acrylic, gel, dip, etc.)
4. **Overlays & Structure** - Services that add strength/length to natural nails (overlays, reinforcements)
5. **Refills & Maintenance** - Maintenance services for existing extensions (fills, backfills, repairs)
6. **Nail Art & Add-Ons** - Decorative services and optional enhancements

For each extracted service:
- Assign it to the most appropriate category based on its core service type
- If a service appears in multiple categories (e.g., "Gel Manicure" could be Manicures or Full Sets), choose the primary categorization
- Preserve the original service name and price for now - we'll adjust in Step 3

**STEP 3: PRICE ALL-INCLUSIVITY (The Sticker Shock Fix)**
Transform the extracted data to prevent sticker shock and booking errors by creating all-inclusive baseline prices:
- Identify any services that are listed as base prices with essential add-ons shown separately (e.g., "Manicure: $20" + "Gel Polish Add-on: $15")
- Bundle essential add-ons into the baseline service name and price to create realistic, transparent service offerings
- Examples of bundling:
  * "Manicure" + "Gel Polish" → "Gel Manicure" (price = base + gel add-on)
  * "Pedicure" + "Cuticle Care" → "Deluxe Pedicure" (if cuticle care is standard)
  * "Acrylic Full Set" + "Length Charge" → "Acrylic Full Set (Medium Length)" (include standard length in base)
- If length/shape fees are hidden or separated, bundle them into clear, descriptive service names:
  * "Full Set" + "Long Length Fee" → "Long Acrylic Full Set"
  * "Overlay" + "Square Shape Charge" → "Square Gel Overlay"
- Create service names that clearly communicate what's included at the price point
- Remove misleading low base prices that require essential add-ons to be functional
- Ensure all-inclusive prices reflect what a customer would actually pay for a complete, bookable service

**OUTPUT FORMAT**
Return ONLY a valid JSON object that matches this structure:
{
  "Manicures": [
    {
      "service_name": "string",
      "price": "number (float or integer)",
      "duration": "string (e.g., '30 minutes', '1 hour')",
      "description": "string (brief description of what's included)"
    }
  ],
  "Pedicures": [
    {
      "service_name": "string",
      "price": "number",
      "duration": "string",
      "description": "string"
    }
  ],
  "Full Sets (Extensions)": [
    {
      "service_name": "string",
      "price": "number",
      "duration": "string",
      "description": "string"
    }
  ],
  "Overlays & Structure": [
    {
      "service_name": "string",
      "price": "number",
      "duration": "string",
      "description": "string"
    }
  ],
  "Refills & Maintenance": [
    {
      "service_name": "string",
      "price": "number",
      "duration": "string",
      "description": "string"
    }
  ],
  "Nail Art & Add-Ons": [
    {
      "service_name": "string",
      "price": "number",
      "duration": "string",
      "description": "string"
    }
  ]
}

**IMPORTANT RULES:**
1. Output MUST be valid JSON only - no additional text, explanations, or formatting
2. If a category has no services, return an empty array for that category
3. Prices should be numbers (not strings) - do not include currency symbols
4. Duration should be a human-readable string (e.g., "45 minutes", "1 hour 15 minutes")
5. Descriptions should be concise but informative about what's included in the all-inclusive price
6. Service names should be clear, customer-friendly, and reflect the bundled all-inclusive nature
7. Do not invent services - only include what was reasonably extractable from the menu
8. When in doubt about categorization, choose the category that best matches the service's primary purpose

Now process the uploaded menu image/PDF according to these instructions."""
    return prompt


def get_json_response_schema():
    """
    Returns the JSON schema for OpenAI's Structured Outputs feature.
    This schema defines the expected structure of the parsed menu data.
    """
    return {
        "type": "object",
        "properties": {
            "Manicures": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_name": {"type": "string"},
                        "price": {"type": "number"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["service_name", "price", "duration", "description"],
                    "additionalProperties": False
                }
            },
            "Pedicures": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_name": {"type": "string"},
                        "price": {"type": "number"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["service_name", "price", "duration", "description"],
                    "additionalProperties": False
                }
            },
            "Full Sets (Extensions)": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_name": {"type": "string"},
                        "price": {"type": "number"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["service_name", "price", "duration", "description"],
                    "additionalProperties": False
                }
            },
            "Overlays & Structure": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_name": {"type": "string"},
                        "price": {"type": "number"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["service_name", "price", "duration", "description"],
                    "additionalProperties": False
                }
            },
            "Refills & Maintenance": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_name": {"type": "string"},
                        "price": {"type": "number"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["service_name", "price", "duration", "description"],
                    "additionalProperties": False
                }
            },
            "Nail Art & Add-Ons": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "service_name": {"type": "string"},
                        "price": {"type": "number"},
                        "duration": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["service_name", "price", "duration", "description"],
                    "additionalProperties": False
                }
            }
        },
        "required": ["Manicures", "Pedicures", "Full Sets (Extensions)", "Overlays & Structure", "Refills & Maintenance", "Nail Art & Add-Ons"],
        "additionalProperties": False
    }


def parse_openai_response(response_text):
    """
    Parses the JSON string from OpenAI API response and returns a clean Python dictionary.
    """
    import json
    try:
        # Parse the JSON response
        parsed_data = json.loads(response_text)
        
        # Ensure all required categories exist (even if empty)
        required_categories = [
            "Manicures", 
            "Pedicures", 
            "Full Sets (Extensions)", 
            "Overlays & Structure", 
            "Refills & Maintenance", 
            "Nail Art & Add-Ons"
        ]
        
        for category in required_categories:
            if category not in parsed_data:
                parsed_data[category] = []
            elif not isinstance(parsed_data[category], list):
                parsed_data[category] = []
        
        return parsed_data
    except json.JSONDecodeError as e:
        # Return a structured error response
        return {
            "error": f"Failed to parse OpenAI response as JSON: {str(e)}",
            "Manicures": [],
            "Pedicures": [],
            "Full Sets (Extensions)": [],
            "Overlays & Structure": [],
            "Refills & Maintenance": [],
            "Nail Art & Add-Ons": []
        }


if __name__ == "__main__":
    # For testing purposes
    print("=== INSTRUCTIONS ===")
    print(get_nail_menu_parser_instructions())
    print("\n=== JSON SCHEMA ===")
    print(get_json_response_schema())