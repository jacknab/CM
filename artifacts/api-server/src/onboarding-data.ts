export type BusinessTemplate = {
  categories: {
    name: string;
    services: {
      name: string;
      description: string;
      duration: number;
      price: string;
      addons?: { name: string; description: string; price: string; duration: number }[];
    }[];
  }[];
};

export const businessTemplates: Record<string, BusinessTemplate> = {
  "Nail Salon": {
    categories: [
      {
        name: "Manicures",
        services: [
          {
            name: "Classic Manicure",
            description: "Basic manicure with polish",
            duration: 20,
            price: "20.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Paraffin Hand Treatment", description: "Hydrating paraffin wax dip", price: "10.00", duration: 15 },
              { name: "Hot Oil Cuticle Treatment", description: "Nourishing oil cuticle care", price: "8.00", duration: 10 },
              { name: "Hand Massage Extension", description: "Extended hand and arm massage", price: "10.00", duration: 10 },
              { name: "Nail Repair (per nail)", description: "Fix a broken or damaged nail", price: "5.00", duration: 10 },
              { name: "Nail Strengthening Treatment", description: "Keratin or calcium nail treatment", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Deluxe Manicure",
            description: "Includes scrub and massage",
            duration: 30,
            price: "15.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Paraffin Hand Treatment", description: "Hydrating paraffin wax dip", price: "10.00", duration: 15 },
              { name: "Hot Oil Cuticle Treatment", description: "Nourishing oil cuticle care", price: "8.00", duration: 10 },
              { name: "Hand Massage Extension", description: "Extended hand and arm massage", price: "10.00", duration: 10 },
              { name: "Nail Strengthening Treatment", description: "Keratin or calcium nail treatment", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Gel Manicure",
            description: "Long-lasting gel polish",
            duration: 50,
            price: "35.00",
            addons: [
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Gel Removal", description: "Safe gel polish removal", price: "10.00", duration: 15 },
              { name: "Paraffin Hand Treatment", description: "Hydrating paraffin wax dip", price: "10.00", duration: 15 },
              { name: "Hot Oil Cuticle Treatment", description: "Nourishing oil cuticle care", price: "8.00", duration: 10 },
              { name: "Hand Massage Extension", description: "Extended hand and arm massage", price: "10.00", duration: 10 },
              { name: "Nail Strengthening Treatment", description: "Keratin or calcium nail treatment", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Spa Manicure",
            description: "Mask, paraffin, massage",
            duration: 60,
            price: "20.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Hot Oil Cuticle Treatment", description: "Nourishing oil cuticle care", price: "8.00", duration: 10 },
              { name: "Nail Strengthening Treatment", description: "Keratin or calcium nail treatment", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Hot Stone Manicure",
            description: "Hot stone hand massage",
            duration: 65,
            price: "45.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Hot Oil Cuticle Treatment", description: "Nourishing oil cuticle care", price: "8.00", duration: 10 },
            ],
          },
        ],
      },
      {
        name: "Pedicures",
        services: [
          {
            name: "Classic Pedicure",
            description: "Basic pedicure",
            duration: 45,
            price: "30.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Callus Treatment", description: "Extra callus removal and smoothing", price: "10.00", duration: 10 },
              { name: "Paraffin Foot Treatment", description: "Hydrating paraffin wax for feet", price: "10.00", duration: 15 },
              { name: "Extended Foot Massage", description: "Additional foot and leg massage", price: "10.00", duration: 10 },
              { name: "Nail Repair (per nail)", description: "Fix a broken or damaged nail", price: "5.00", duration: 10 },
            ],
          },
          {
            name: "Deluxe Pedicure",
            description: "Scrub and massage",
            duration: 60,
            price: "40.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Callus Treatment", description: "Extra callus removal and smoothing", price: "10.00", duration: 10 },
              { name: "Paraffin Foot Treatment", description: "Hydrating paraffin wax for feet", price: "10.00", duration: 15 },
              { name: "Extended Foot Massage", description: "Additional foot and leg massage", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Spa Pedicure",
            description: "Mask and paraffin",
            duration: 75,
            price: "50.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Callus Treatment", description: "Extra callus removal and smoothing", price: "10.00", duration: 10 },
              { name: "Extended Foot Massage", description: "Additional foot and leg massage", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Gel Pedicure",
            description: "Gel polish pedicure",
            duration: 60,
            price: "45.00",
            addons: [
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Gel Removal", description: "Safe gel polish removal", price: "10.00", duration: 15 },
              { name: "Acrylic/Dip Removal", description: "Remove acrylic or dip", price: "10.00", duration: 25 },
              { name: "Callus Treatment", description: "Extra callus removal and smoothing", price: "10.00", duration: 10 },
              { name: "Paraffin Foot Treatment", description: "Hydrating paraffin wax for feet", price: "10.00", duration: 15 },
              { name: "Extended Foot Massage", description: "Additional foot and leg massage", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Hot Stone Pedicure",
            description: "Hot stone massage",
            duration: 80,
            price: "55.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Acrylic/Dip Removal", description: "Remove acrylic or dip", price: "10.00", duration: 25 },
              { name: "Callus Treatment", description: "Extra callus removal and smoothing", price: "10.00", duration: 10 },
            ],
          },
        ],
      },
      {
        name: "Nail Enhancements",
        services: [
          {
            name: "Acrylic Full Set",
            description: "Full acrylic set",
            duration: 75,
            price: "60.00",
            addons: [
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Extra Length", description: "Extra long nail extensions", price: "10.00", duration: 10 },
              { name: "Acrylic/Dip Removal", description: "Remove acrylic or dip", price: "10.00", duration: 25 },
              { name: "Nail Strengthening Treatment", description: "Keratin or calcium nail treatment", price: "10.00", duration: 10 },
              { name: "Chrome/Mirror Finish", description: "Chrome or mirror powder finish", price: "15.00", duration: 10 },
              { name: "Ombre/Gradient Design", description: "Blended ombre nail design", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Acrylic Fill",
            description: "Acrylic refill",
            duration: 60,
            price: "40.00",
            addons: [
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Acrylic/Dip Removal", description: "Remove acrylic or dip", price: "10.00", duration: 25 },
              { name: "Chrome/Mirror Finish", description: "Chrome or mirror powder finish", price: "15.00", duration: 10 },
              { name: "Ombre/Gradient Design", description: "Blended ombre nail design", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Gel Full Set",
            description: "Gel overlay",
            duration: 75,
            price: "55.00",
            addons: [
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Extra Length", description: "Extra long nail extensions", price: "10.00", duration: 10 },
              { name: "Gel Removal", description: "Safe gel polish removal", price: "10.00", duration: 15 },
              { name: "Chrome/Mirror Finish", description: "Chrome or mirror powder finish", price: "15.00", duration: 10 },
              { name: "Ombre/Gradient Design", description: "Blended ombre nail design", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Dip Powder Full Set",
            description: "Dip powder nails",
            duration: 60,
            price: "50.00",
            addons: [
              { name: "French Tips", description: "Classic french tip design", price: "10.00", duration: 10 },
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
              { name: "Nail Art - Complex", description: "Detailed multi-nail art", price: "15.00", duration: 20 },
              { name: "Acrylic/Dip Removal", description: "Remove acrylic or dip", price: "10.00", duration: 25 },
              { name: "Chrome/Mirror Finish", description: "Chrome or mirror powder finish", price: "15.00", duration: 10 },
              { name: "Ombre/Gradient Design", description: "Blended ombre nail design", price: "15.00", duration: 15 },
            ],
          },
        ],
      },
      {
        name: "Spa Services",
        services: [
          {
            name: "Mani-Pedi Combo",
            description: "Classic manicure and pedicure",
            duration: 60,
            price: "45.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "Paraffin Hand Treatment", description: "Hydrating paraffin wax dip", price: "10.00", duration: 15 },
              { name: "Paraffin Foot Treatment", description: "Hydrating paraffin wax for feet", price: "10.00", duration: 15 },
            ],
          },
          {
            name: "Deluxe Mani-Pedi Combo",
            description: "Deluxe manicure and pedicure",
            duration: 90,
            price: "55.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
              { name: "Paraffin Hand Treatment", description: "Hydrating paraffin wax dip", price: "10.00", duration: 15 },
              { name: "Paraffin Foot Treatment", description: "Hydrating paraffin wax for feet", price: "10.00", duration: 15 },
            ],
          },
          {
            name: "Spa Mani-Pedi Combo",
            description: "Full spa manicure and pedicure",
            duration: 120,
            price: "70.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Hand & Foot Paraffin Treatment",
            description: "Hydrating paraffin wax for hands and feet",
            duration: 30,
            price: "25.00",
            addons: [
              { name: "Acrylic/Dip Removal", description: "Remove acrylic or dip", price: "10.00", duration: 25 },
            ],
          },
          {
            name: "Eyelash Extensions - Classic",
            description: "Classic individual lash extensions",
            duration: 90,
            price: "80.00",
            addons: [
              { name: "Lash Removal", description: "Remove existing lash extensions", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Eyebrow Wax & Tint",
            description: "Shape and tint eyebrows",
            duration: 25,
            price: "25.00",
          },
        ],
      },
      {
        name: "Kids Services",
        services: [
          {
            name: "Kids Manicure",
            description: "Mini manicure for kids under 12",
            duration: 15,
            price: "12.00",
            addons: [
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
            ],
          },
          {
            name: "Kids Pedicure",
            description: "Mini pedicure for kids under 12",
            duration: 20,
            price: "15.00",
            addons: [
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
            ],
          },
          {
            name: "Kids Mani-Pedi Combo",
            description: "Mini manicure and pedicure for kids",
            duration: 30,
            price: "22.00",
            addons: [
              { name: "Nail Art - Simple", description: "Simple design on 1-2 nails", price: "5.00", duration: 10 },
            ],
          },
        ],
      },
      {
        name: "Nail Repair",
        services: [
          {
            name: "Single Nail Repair",
            description: "Fix one broken or damaged nail",
            duration: 15,
            price: "8.00",
          },
          {
            name: "Nail Removal - Acrylic/Dip",
            description: "Safe removal of acrylic or dip nails",
            duration: 30,
            price: "20.00",
          },
          {
            name: "Nail Removal - Gel",
            description: "Safe removal of gel polish",
            duration: 20,
            price: "15.00",
          },
          {
            name: "Polish Change - Hands",
            description: "Quick polish change on hands",
            duration: 15,
            price: "10.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Polish Change - Feet",
            description: "Quick polish change on feet",
            duration: 15,
            price: "12.00",
            addons: [
              { name: "Gel Polish Upgrade", description: "Upgrade to gel polish", price: "15.00", duration: 15 },
            ],
          },
        ],
      },
    ],
  },

  "Hair Salon": {
    categories: [
      {
        name: "Haircuts",
        services: [
          {
            name: "Women's Haircut",
            description: "Wash, cut and blow dry",
            duration: 60,
            price: "55.00",
            addons: [
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
              { name: "Scalp Massage", description: "Relaxing scalp treatment", price: "10.00", duration: 10 },
              { name: "Bang/Fringe Trim", description: "Quick fringe touch-up", price: "10.00", duration: 10 },
              { name: "Blow Dry Upgrade", description: "Premium blow dry styling", price: "15.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
            ],
          },
          {
            name: "Men's Haircut",
            description: "Classic men's cut and style",
            duration: 30,
            price: "30.00",
            addons: [
              { name: "Beard Trim", description: "Shape and trim beard", price: "12.00", duration: 10 },
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Hair Wash", description: "Shampoo and condition", price: "5.00", duration: 10 },
              { name: "Eyebrow Trim", description: "Quick eyebrow cleanup", price: "8.00", duration: 5 },
            ],
          },
          {
            name: "Children's Haircut",
            description: "Haircut for children under 12",
            duration: 30,
            price: "22.00",
          },
          {
            name: "Blow Dry & Style",
            description: "Professional blow dry and styling",
            duration: 45,
            price: "40.00",
            addons: [
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
              { name: "Flat Iron Finish", description: "Sleek flat iron styling", price: "10.00", duration: 10 },
              { name: "Curling Iron Finish", description: "Curls or waves with curling iron", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Dry Cut",
            description: "Precision dry cut without wash",
            duration: 30,
            price: "35.00",
          },
          {
            name: "Long Hair Cut",
            description: "Cut for hair past shoulders",
            duration: 75,
            price: "65.00",
            addons: [
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
              { name: "Scalp Massage", description: "Relaxing scalp treatment", price: "10.00", duration: 10 },
            ],
          },
        ],
      },
      {
        name: "Color",
        services: [
          {
            name: "Full Color",
            description: "Full head single-process color",
            duration: 120,
            price: "120.00",
            addons: [
              { name: "Gloss Treatment", description: "Add shine and tone", price: "25.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
            ],
          },
          {
            name: "Root Touch-Up",
            description: "Color application at the roots",
            duration: 75,
            price: "80.00",
            addons: [
              { name: "Gloss Treatment", description: "Add shine and tone", price: "25.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
            ],
          },
          {
            name: "Highlights - Partial",
            description: "Face-framing foil highlights",
            duration: 90,
            price: "110.00",
            addons: [
              { name: "Toner", description: "Tone and neutralize brassiness", price: "20.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
              { name: "Gloss Treatment", description: "Add shine and tone", price: "25.00", duration: 15 },
            ],
          },
          {
            name: "Highlights - Full",
            description: "Full head foil highlights",
            duration: 150,
            price: "160.00",
            addons: [
              { name: "Toner", description: "Tone and neutralize brassiness", price: "20.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
              { name: "Gloss Treatment", description: "Add shine and tone", price: "25.00", duration: 15 },
            ],
          },
          {
            name: "Balayage",
            description: "Hand-painted natural highlights",
            duration: 180,
            price: "200.00",
            addons: [
              { name: "Toner", description: "Tone and neutralize brassiness", price: "20.00", duration: 15 },
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
              { name: "Gloss Treatment", description: "Add shine and tone", price: "25.00", duration: 15 },
            ],
          },
          {
            name: "Color Correction",
            description: "Complex color fix or transformation",
            duration: 240,
            price: "300.00",
            addons: [
              { name: "Olaplex Treatment", description: "Bond repair treatment", price: "35.00", duration: 20 },
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
            ],
          },
          {
            name: "Gray Blending",
            description: "Natural-looking gray coverage",
            duration: 90,
            price: "95.00",
            addons: [
              { name: "Gloss Treatment", description: "Add shine and tone", price: "25.00", duration: 15 },
            ],
          },
        ],
      },
      {
        name: "Treatments",
        services: [
          {
            name: "Keratin Treatment",
            description: "Smoothing keratin treatment",
            duration: 150,
            price: "250.00",
          },
          {
            name: "Hair Mask Treatment",
            description: "Deep conditioning mask treatment",
            duration: 30,
            price: "35.00",
          },
          {
            name: "Scalp Treatment",
            description: "Exfoliating scalp detox",
            duration: 30,
            price: "40.00",
          },
          {
            name: "Olaplex Standalone",
            description: "Full Olaplex bond repair service",
            duration: 45,
            price: "50.00",
          },
          {
            name: "Brazilian Blowout",
            description: "Smoothing and frizz reduction",
            duration: 120,
            price: "200.00",
          },
        ],
      },
      {
        name: "Styling",
        services: [
          {
            name: "Updo / Event Style",
            description: "Formal or event hairstyle",
            duration: 75,
            price: "75.00",
            addons: [
              { name: "Extensions Clip-In", description: "Clip-in extensions for volume", price: "20.00", duration: 15 },
            ],
          },
          {
            name: "Bridal Hair",
            description: "Wedding day hairstyling",
            duration: 90,
            price: "150.00",
            addons: [
              { name: "Bridal Trial", description: "Trial run before wedding day", price: "75.00", duration: 60 },
              { name: "Extensions Clip-In", description: "Clip-in extensions for volume", price: "20.00", duration: 15 },
            ],
          },
          {
            name: "Braids",
            description: "Custom braiding styles",
            duration: 60,
            price: "60.00",
          },
          {
            name: "Extensions - Tape-In",
            description: "Semi-permanent tape-in extensions",
            duration: 120,
            price: "300.00",
          },
          {
            name: "Extensions - Move Up",
            description: "Reinstall existing tape-in extensions",
            duration: 90,
            price: "150.00",
          },
        ],
      },
      {
        name: "Texture",
        services: [
          {
            name: "Perm",
            description: "Traditional perm for curls or waves",
            duration: 120,
            price: "120.00",
            addons: [
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
            ],
          },
          {
            name: "Relaxer",
            description: "Chemical straightening treatment",
            duration: 90,
            price: "100.00",
            addons: [
              { name: "Deep Conditioning Treatment", description: "Intensive moisture treatment", price: "20.00", duration: 15 },
            ],
          },
        ],
      },
    ],
  },

  "Spa": {
    categories: [
      {
        name: "Massage",
        services: [
          {
            name: "Swedish Massage - 60 min",
            description: "Full body relaxation massage",
            duration: 60,
            price: "85.00",
            addons: [
              { name: "Aromatherapy", description: "Essential oil enhancement", price: "10.00", duration: 5 },
              { name: "Hot Stones Add-On", description: "Add heated stones to massage", price: "15.00", duration: 10 },
              { name: "CBD Oil Upgrade", description: "CBD-infused massage oil", price: "15.00", duration: 0 },
              { name: "Extended Time - 30 min", description: "Add 30 minutes to session", price: "40.00", duration: 30 },
            ],
          },
          {
            name: "Swedish Massage - 90 min",
            description: "Extended full body relaxation massage",
            duration: 90,
            price: "120.00",
            addons: [
              { name: "Aromatherapy", description: "Essential oil enhancement", price: "10.00", duration: 5 },
              { name: "Hot Stones Add-On", description: "Add heated stones to massage", price: "15.00", duration: 10 },
              { name: "CBD Oil Upgrade", description: "CBD-infused massage oil", price: "15.00", duration: 0 },
            ],
          },
          {
            name: "Deep Tissue Massage - 60 min",
            description: "Targeted therapeutic deep tissue work",
            duration: 60,
            price: "95.00",
            addons: [
              { name: "Cupping", description: "Add cupping therapy", price: "20.00", duration: 15 },
              { name: "Extended Time - 30 min", description: "Add 30 minutes to session", price: "45.00", duration: 30 },
              { name: "CBD Oil Upgrade", description: "CBD-infused massage oil", price: "15.00", duration: 0 },
            ],
          },
          {
            name: "Deep Tissue Massage - 90 min",
            description: "Extended therapeutic deep tissue",
            duration: 90,
            price: "130.00",
            addons: [
              { name: "Cupping", description: "Add cupping therapy", price: "20.00", duration: 15 },
              { name: "CBD Oil Upgrade", description: "CBD-infused massage oil", price: "15.00", duration: 0 },
            ],
          },
          {
            name: "Hot Stone Massage",
            description: "Full body heated stone therapy",
            duration: 75,
            price: "110.00",
            addons: [
              { name: "Aromatherapy", description: "Essential oil enhancement", price: "10.00", duration: 5 },
            ],
          },
          {
            name: "Couples Massage",
            description: "Side-by-side relaxation massage for two",
            duration: 60,
            price: "170.00",
            addons: [
              { name: "Aromatherapy", description: "Essential oil enhancement", price: "10.00", duration: 5 },
              { name: "Hot Stones Add-On", description: "Add heated stones to massage", price: "15.00", duration: 10 },
            ],
          },
          {
            name: "Prenatal Massage",
            description: "Gentle massage for expectant mothers",
            duration: 60,
            price: "90.00",
          },
          {
            name: "Sports Massage",
            description: "Athletic recovery and performance massage",
            duration: 60,
            price: "95.00",
            addons: [
              { name: "Cupping", description: "Add cupping therapy", price: "20.00", duration: 15 },
              { name: "Extended Time - 30 min", description: "Add 30 minutes to session", price: "45.00", duration: 30 },
            ],
          },
          {
            name: "Reflexology",
            description: "Pressure point foot therapy",
            duration: 45,
            price: "65.00",
          },
        ],
      },
      {
        name: "Facials",
        services: [
          {
            name: "Classic Facial",
            description: "Deep cleanse, exfoliate and hydrate",
            duration: 60,
            price: "85.00",
            addons: [
              { name: "LED Light Therapy", description: "Anti-aging LED treatment", price: "20.00", duration: 15 },
              { name: "Lip Treatment", description: "Hydrating lip mask", price: "10.00", duration: 10 },
              { name: "Eye Treatment", description: "De-puffing eye mask", price: "10.00", duration: 10 },
              { name: "High Frequency", description: "Antibacterial high frequency treatment", price: "15.00", duration: 10 },
              { name: "Extractions", description: "Professional pore extraction", price: "15.00", duration: 15 },
            ],
          },
          {
            name: "Anti-Aging Facial",
            description: "Targeted anti-aging treatment with peptides",
            duration: 75,
            price: "120.00",
            addons: [
              { name: "LED Light Therapy", description: "Anti-aging LED treatment", price: "20.00", duration: 15 },
              { name: "Microdermabrasion", description: "Crystal exfoliation add-on", price: "30.00", duration: 20 },
              { name: "Lip Treatment", description: "Hydrating lip mask", price: "10.00", duration: 10 },
              { name: "Eye Treatment", description: "De-puffing eye mask", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Hydrating Facial",
            description: "Intensive moisture boost facial",
            duration: 60,
            price: "95.00",
            addons: [
              { name: "LED Light Therapy", description: "Anti-aging LED treatment", price: "20.00", duration: 15 },
              { name: "Lip Treatment", description: "Hydrating lip mask", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Acne Treatment Facial",
            description: "Deep pore cleansing for acne-prone skin",
            duration: 60,
            price: "90.00",
            addons: [
              { name: "High Frequency", description: "Antibacterial high frequency treatment", price: "15.00", duration: 10 },
              { name: "Extractions", description: "Professional pore extraction", price: "15.00", duration: 15 },
              { name: "LED Light Therapy", description: "Anti-aging LED treatment", price: "20.00", duration: 15 },
            ],
          },
          {
            name: "Gentleman's Facial",
            description: "Facial designed for men's skin",
            duration: 60,
            price: "85.00",
            addons: [
              { name: "LED Light Therapy", description: "Anti-aging LED treatment", price: "20.00", duration: 15 },
              { name: "High Frequency", description: "Antibacterial high frequency treatment", price: "15.00", duration: 10 },
            ],
          },
          {
            name: "Chemical Peel",
            description: "Professional-grade chemical exfoliation",
            duration: 45,
            price: "100.00",
          },
          {
            name: "Microneedling",
            description: "Collagen induction therapy",
            duration: 60,
            price: "150.00",
          },
        ],
      },
      {
        name: "Body Treatments",
        services: [
          {
            name: "Body Scrub",
            description: "Full body exfoliation treatment",
            duration: 45,
            price: "75.00",
            addons: [
              { name: "Aromatherapy", description: "Essential oil enhancement", price: "10.00", duration: 5 },
            ],
          },
          {
            name: "Body Wrap",
            description: "Detoxifying or hydrating body wrap",
            duration: 60,
            price: "90.00",
            addons: [
              { name: "Aromatherapy", description: "Essential oil enhancement", price: "10.00", duration: 5 },
            ],
          },
          {
            name: "Mud Treatment",
            description: "Mineral-rich mud body treatment",
            duration: 60,
            price: "95.00",
          },
          {
            name: "Back Facial",
            description: "Cleansing and treatment for the back",
            duration: 45,
            price: "70.00",
            addons: [
              { name: "Extractions", description: "Professional pore extraction", price: "15.00", duration: 15 },
            ],
          },
        ],
      },
      {
        name: "Waxing",
        services: [
          { name: "Eyebrow Wax", description: "Precision eyebrow shaping", duration: 15, price: "18.00" },
          { name: "Lip Wax", description: "Upper lip waxing", duration: 10, price: "12.00" },
          { name: "Chin Wax", description: "Chin area waxing", duration: 10, price: "12.00" },
          { name: "Full Face Wax", description: "Complete facial waxing", duration: 30, price: "40.00" },
          { name: "Underarm Wax", description: "Underarm waxing", duration: 15, price: "20.00" },
          { name: "Full Arm Wax", description: "Complete arm waxing", duration: 30, price: "40.00" },
          { name: "Half Leg Wax", description: "Lower leg waxing", duration: 30, price: "35.00" },
          { name: "Full Leg Wax", description: "Complete leg waxing", duration: 45, price: "65.00" },
          { name: "Bikini Wax", description: "Standard bikini line wax", duration: 20, price: "35.00" },
          { name: "Brazilian Wax", description: "Full Brazilian wax", duration: 30, price: "55.00" },
          { name: "Back Wax", description: "Full back waxing", duration: 30, price: "45.00" },
          { name: "Chest Wax", description: "Full chest waxing", duration: 30, price: "40.00" },
        ],
      },
      {
        name: "Packages",
        services: [
          {
            name: "Spa Day Package",
            description: "60-min massage, facial and body scrub",
            duration: 180,
            price: "220.00",
          },
          {
            name: "Couples Retreat",
            description: "Couples massage, facial and champagne",
            duration: 150,
            price: "350.00",
          },
          {
            name: "Relaxation Package",
            description: "90-min massage and classic facial",
            duration: 150,
            price: "180.00",
          },
        ],
      },
    ],
  },

  "Barbershop": {
    categories: [
      {
        name: "Haircuts",
        services: [
          {
            name: "Men's Haircut",
            description: "Classic men's cut and style",
            duration: 30,
            price: "28.00",
            addons: [
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Hair Wash", description: "Shampoo and condition", price: "5.00", duration: 10 },
              { name: "Eyebrow Trim", description: "Quick eyebrow cleanup", price: "5.00", duration: 5 },
              { name: "Neck Razor Cleanup", description: "Razor edge cleanup around neckline", price: "5.00", duration: 5 },
              { name: "Hair Product Styling", description: "Premium product finish", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Skin Fade",
            description: "Precision skin fade haircut",
            duration: 45,
            price: "35.00",
            addons: [
              { name: "Design / Line Up", description: "Custom hair design or hard part", price: "10.00", duration: 10 },
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Hair Wash", description: "Shampoo and condition", price: "5.00", duration: 10 },
              { name: "Eyebrow Trim", description: "Quick eyebrow cleanup", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Taper Fade",
            description: "Gradual taper fade haircut",
            duration: 40,
            price: "32.00",
            addons: [
              { name: "Design / Line Up", description: "Custom hair design or hard part", price: "10.00", duration: 10 },
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Eyebrow Trim", description: "Quick eyebrow cleanup", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Buzz Cut",
            description: "All-over clipper cut",
            duration: 15,
            price: "18.00",
          },
          {
            name: "Kids Haircut",
            description: "Children's haircut under 12",
            duration: 20,
            price: "20.00",
            addons: [
              { name: "Design / Line Up", description: "Custom hair design or hard part", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Senior Haircut",
            description: "Haircut for seniors 65+",
            duration: 30,
            price: "22.00",
          },
          {
            name: "Long Hair Cut",
            description: "Cut and style for longer hair",
            duration: 45,
            price: "38.00",
            addons: [
              { name: "Hair Wash", description: "Shampoo and condition", price: "5.00", duration: 10 },
              { name: "Hair Product Styling", description: "Premium product finish", price: "5.00", duration: 5 },
            ],
          },
        ],
      },
      {
        name: "Beard & Shave",
        services: [
          {
            name: "Beard Trim",
            description: "Shape and trim beard",
            duration: 20,
            price: "18.00",
            addons: [
              { name: "Beard Oil Treatment", description: "Conditioning beard oil", price: "5.00", duration: 5 },
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Beard Balm Finish", description: "Styling beard balm application", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Hot Towel Shave",
            description: "Traditional straight razor shave with hot towel",
            duration: 30,
            price: "35.00",
            addons: [
              { name: "Beard Oil Treatment", description: "Conditioning beard oil", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Beard Design",
            description: "Custom beard sculpting and design",
            duration: 30,
            price: "28.00",
            addons: [
              { name: "Beard Oil Treatment", description: "Conditioning beard oil", price: "5.00", duration: 5 },
              { name: "Beard Balm Finish", description: "Styling beard balm application", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Beard Color",
            description: "Natural beard color application",
            duration: 30,
            price: "25.00",
          },
        ],
      },
      {
        name: "Combos",
        services: [
          {
            name: "Haircut + Beard Combo",
            description: "Full haircut with beard trim",
            duration: 45,
            price: "42.00",
            addons: [
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Beard Oil Treatment", description: "Conditioning beard oil", price: "5.00", duration: 5 },
              { name: "Hair Wash", description: "Shampoo and condition", price: "5.00", duration: 10 },
              { name: "Design / Line Up", description: "Custom hair design or hard part", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Fade + Beard Combo",
            description: "Skin fade with beard trim",
            duration: 55,
            price: "48.00",
            addons: [
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
              { name: "Beard Oil Treatment", description: "Conditioning beard oil", price: "5.00", duration: 5 },
              { name: "Design / Line Up", description: "Custom hair design or hard part", price: "10.00", duration: 10 },
            ],
          },
          {
            name: "Full Service",
            description: "Haircut, beard trim, hot towel and wash",
            duration: 60,
            price: "55.00",
          },
        ],
      },
      {
        name: "Grooming",
        services: [
          {
            name: "Eyebrow Cleanup",
            description: "Eyebrow shaping and trim",
            duration: 10,
            price: "10.00",
          },
          {
            name: "Nose / Ear Wax",
            description: "Quick nose or ear hair removal",
            duration: 10,
            price: "10.00",
          },
          {
            name: "Head Shave",
            description: "Full head razor shave",
            duration: 30,
            price: "30.00",
            addons: [
              { name: "Hot Towel", description: "Relaxing hot towel finish", price: "5.00", duration: 5 },
            ],
          },
          {
            name: "Line Up Only",
            description: "Edge and line up only, no full cut",
            duration: 15,
            price: "12.00",
          },
          {
            name: "Hair Color",
            description: "Men's hair color application",
            duration: 45,
            price: "40.00",
          },
          {
            name: "Gray Blending",
            description: "Natural gray coverage for men",
            duration: 30,
            price: "30.00",
          },
        ],
      },
    ],
  },
};
