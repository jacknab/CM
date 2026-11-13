/**
 * The Kiosk Builder's built-in guide (plans/kiosk-builder.md), written for salon owners: plain words, short steps.
 * Keep it true to the builder: when a setting changes, change its topic here.
 */

export type HelpBlock =
  | { p: string }
  | { steps: string[] }
  | { list: string[] }
  | { tip: string }
  | { h: string }
  | { see: Array<{ topic: HelpTopicId; label: string }> };

export type HelpTopicId =
  | "start" | "publish" | "look" | "welcome" | "steps" | "screens" | "builders" | "easy" | "picture"
  | "extras" | "words" | "configurations" | "recipe-shapes" | "recipe-menu" | "recipe-welcome" | "recipe-undo"
  | "recipe-tablet" | "glossary" | "trouble";

export interface HelpTopic { id: HelpTopicId; group: "Getting started" | "The sections" | "How do I…" | "More help"; title: string; blocks: HelpBlock[] }

export const KIOSK_HELP: HelpTopic[] = [
  // ── Getting started ──────────────────────────────────────────────────────────
  {
    id: "start", group: "Getting started", title: "Start here",
    blocks: [
      { p: "The Kiosk Builder is where you decide what your check-in kiosk looks like and what clients do on it: the welcome picture, the colours, the steps, the screens where they pick services, and the words it shows." },
      { h: "The three columns" },
      { list: [
        "Left: the sections. Pick one to work on it. Under each name is a short summary of how it is set right now.",
        "Middle: the settings for the section you picked.",
        "Right: your 15\" kiosk, exactly as clients will see it. It moves to the screen the section is about. You can tap through it like a client; nothing you do there checks anyone in.",
      ] },
      { h: "Nothing you change goes live by itself" },
      { p: "Every change saves on its own to your draft (you'll see \"Draft saved\" at the top). Your kiosk in the salon keeps showing the last design you published until you press Publish." },
      { steps: [
        "Pick a section on the left and change what you like.",
        "Check it on the kiosk on the right. Use the buttons above it (Welcome, Phone, Categories…) to see any screen.",
        "When you're happy, press Publish at the top right.",
      ] },
      { tip: "Not sure? Change one thing at a time and look at the kiosk on the right after each change. If you make a mess, History brings back what you had published." },
      { see: [{ topic: "publish", label: "Publish and History" }, { topic: "glossary", label: "Words you'll see" }] },
    ],
  },
  {
    id: "publish", group: "Getting started", title: "Publish and History",
    blocks: [
      { h: "Publish" },
      { p: "Publish puts your draft on your kiosk. You can add a short note (for example \"Holiday colours\") so you remember what changed. The kiosk switches to the new design the next time no one is using it, usually within a few minutes." },
      { p: "Publish is grey when there is nothing new to publish." },
      { h: "History" },
      { p: "Every time you publish, a numbered version is kept. History lists them, newest first, with the one on your kiosk marked Live." },
      { steps: [
        "Press History at the top.",
        "Find the version you want back and press Load. It goes into your draft (your kiosk doesn't change yet).",
        "Check it on the kiosk on the right, then press Publish.",
      ] },
      { see: [{ topic: "configurations", label: "Saving designs under a name" }] },
    ],
  },

  // ── The sections ─────────────────────────────────────────────────────────────
  {
    id: "look", group: "The sections", title: "Look",
    blocks: [
      { p: "The style of the whole kiosk." },
      { list: [
        "Classic: lavender and rose, rounded buttons.",
        "Boutique: cream and copper with elegant serif headings. Nail salons start with this one.",
      ] },
      { p: "Under the look you can pick your own colours for buttons and highlights, the background, cards and bars, and the text. The little square shows the colour in use. Reset puts back the look's own colour." },
      { tip: "Pick your brand colour for \"Buttons and highlights\" first; it changes the most. Keep text dark on a light background so it is easy to read." },
    ],
  },
  {
    id: "welcome", group: "The sections", title: "Welcome screen",
    blocks: [
      { p: "The first thing clients see: one picture that fills the whole screen. A tap anywhere starts the check-in." },
      { h: "Your own picture" },
      { steps: [
        "Make a tall picture, 1080 × 1920 pixels (the shape of the 15\" kiosk standing up). Canva or any phone design app can do this size.",
        "Press Upload picture and choose it (JPG, PNG or WebP).",
        "\"Use Certxa's picture\" puts the standard welcome picture back.",
      ] },
      { h: "Language buttons" },
      { p: "Tick the languages clients can choose at the bottom of the welcome screen. English is always there. With only English ticked, no language buttons show." },
      { see: [{ topic: "recipe-welcome", label: "Change the welcome picture, step by step" }] },
    ],
  },
  {
    id: "steps", group: "The sections", title: "Check-in steps",
    blocks: [
      { p: "After typing their phone number (and their name, the first time), clients go through these steps, then see a review of their visit and press Check In." },
      { h: "The steps" },
      { list: [
        "Categories: big cards for each kind of service (Manicures, Pedicures…). Turn it off to show one list of every service.",
        "Services: the list of services. Always on.",
        "Service questions: questions a service asks, like nail length, shape and design. Set them up in Catalog › Nail Config.",
        "Add-ons: extras for the service they chose.",
        "Choose staff: clients pick who they'd like, or \"Next available\". Only staff who are clocked in and free are shown.",
      ] },
      { p: "Use the arrows to change the order of the last three. A step with nothing to show (no add-ons for that service, nobody clocked in) is skipped by itself." },
      { h: "Rules" },
      { list: [
        "Services per check-in: how many services one client can pick at the kiosk (1 to 3).",
        "Longest visit: with more than one service, the longest the visit can be. Longer visits are booked at the front desk.",
        "Show prices / Show how long services take: what the service cards show.",
        "Smart Check-In: suggests a returning client's usual service, or a fill when one is due.",
        "Ticket screen stays for: how long the \"You're checked in\" screen stays before the kiosk goes back to the welcome screen.",
      ] },
    ],
  },
  {
    id: "screens", group: "The sections", title: "Service screens",
    blocks: [
      { p: "By default clients pick services from category cards and a list made from your catalog. Service screens let you design those screens yourself instead." },
      { steps: [
        "Choose a builder: Easy builder or Picture builder (see \"Which builder should I use?\").",
        "Make your screens.",
        "Turn on \"Use my own screens\" and choose the screen clients start on.",
        "Check it with Live preview, then Publish.",
      ] },
      { p: "While \"Use my own screens\" is off, your screens are kept but the kiosk shows the normal category cards." },
      { h: "Editing a screen" },
      { list: [
        "Pick a screen in the Screens list. The kiosk on the right becomes the editing canvas.",
        "Tap something on the canvas to change it. Its settings open in a box at the top of the middle column.",
        "Edit screen / Live preview (above the canvas) switches between editing and trying it like a client.",
        "The bin next to a screen in the list deletes it. Buttons and tap spots that opened it are removed too.",
      ] },
      { see: [{ topic: "builders", label: "Which builder should I use?" }, { topic: "easy", label: "Easy builder" }, { topic: "picture", label: "Picture builder" }] },
    ],
  },
  {
    id: "builders", group: "The sections", title: "Which builder should I use?",
    blocks: [
      { h: "Easy builder" },
      { p: "Screens of buttons, laid out for you. Each button shows the service's name, picture and price straight from your catalog, so when you change a price it changes on the kiosk too. Best for most salons, and for long menus." },
      { h: "Picture builder" },
      { p: "You design each whole screen as a picture (in Canva, Photoshop or by a designer), upload it, and mark the parts clients tap. Total control of the look, like the nail-shape guide many salons hang on the wall." },
      { tip: "On a picture, names and prices are part of the artwork. If you change a price, change the picture too. (The client is always charged your real catalog price; the review screen shows it before they check in.)" },
      { h: "One builder per kiosk" },
      { p: "A kiosk uses one builder; the two can't be mixed. Switching to the other builder starts your screens over. To keep what you made, save it first under Configurations." },
    ],
  },
  {
    id: "easy", group: "The sections", title: "Easy builder",
    blocks: [
      { h: "The quickest start" },
      { p: "Press \"Build screens from my catalog\". You get a start screen with one button per category, and a screen of services for each category. Then change what you like." },
      { h: "Layout of a screen" },
      { list: [
        "One, centered: one big button per page.",
        "1, 2, 3 or 4 across, with 1 to 6 rows on a page. The buttons always fill the 15\" screen exactly; more buttons go onto the next page and clients use the arrows.",
      ] },
      { h: "Buttons" },
      { list: [
        "Tap an empty slot (\"+ Add\") to add a button: a service, an extra or add-on, or a button that opens another screen (like a folder).",
        "Tap a button to change its name or picture, open the screen it links to, or remove it.",
        "Drag a button onto another slot to move it.",
        "\"Fill empty slots with a category's services\" adds a whole category at once.",
        "Add page gives the screen another page.",
      ] },
      { p: "Heading on the screen: leave it empty for the normal greeting (\"Hi Anna! What brings you in today?\"). If you write your own, {name} becomes the client's first name." },
    ],
  },
  {
    id: "picture", group: "The sections", title: "Picture builder",
    blocks: [
      { h: "1. Make the picture" },
      { steps: [
        "Press \"Download template\". It is a 1080 × 1920 picture with a grid and a dashed safe line.",
        "Design your whole screen on it: titles, photos, prices, and the parts clients will tap (\"Coffin\", \"Continue\"…). Keep words inside the dashed line, and make each tappable part at least 160 × 100 pixels so a finger can hit it.",
        "Save it as JPG or PNG and press Upload picture.",
      ] },
      { h: "2. Add tap spots" },
      { p: "A tap spot is an invisible button over part of your picture." },
      { steps: [
        "Press \"Add tap spot\". A box appears on the picture.",
        "Drag the box over the part to tap; drag its corners until it covers it. Arrow keys move it a little (hold Shift for more, Alt to change its size). Delete removes it.",
        "Choose what it does: a Service, an Add-on or Kiosk Extra, a Function (Continue, Back, Start over) or a Screen to open.",
      ] },
      { h: "3. The footer (optional)" },
      { p: "Turn on \"Show the kiosk footer\" to put the kiosk's own bar at the bottom: Back, what the client chose, the total and Continue. It covers the bottom strip of your picture (marked on the template), so keep tap spots out of it. With the footer on you don't need your own Back and Continue spots." },
      { h: "Warnings" },
      { p: "Orange notes under the settings tell you when clients could get stuck, for example \"add a tap spot set to Continue\". Fix them before you publish." },
      { see: [{ topic: "recipe-shapes", label: "Make a nail-shape screen, step by step" }] },
    ],
  },
  {
    id: "extras", group: "The sections", title: "Kiosk Extras",
    blocks: [
      { p: "Kiosk Extras are choices that exist only on your kiosk, like nail shapes. Most are free; some can have a price. You don't have to add them to your services." },
      { list: [
        "Name: what it's called, like \"Coffin\".",
        "Price: 0 shows as \"Included\". A price is added to the client's total.",
        "Extra minutes: time added to the visit, if any.",
        "Group: extras in the same group (like \"Nail shape\") are pick-one: choosing another replaces the first.",
      ] },
      { p: "Tick \"Clients must choose one\" on a group and Continue waits until the client picks one of them (\"Please choose your nail shape\")." },
      { h: "Where they go" },
      { list: [
        "Put them on your screens: a tap spot (Add-on tab) or a button (\"An extra\"). You can also make a new extra right there.",
        "A client chooses a service first; the extra is added to it.",
        "The choice goes on the client's ticket as its own line, so the tech sees it and the front desk charges it at checkout.",
        "Extras don't show on your booking website or in your normal add-ons.",
      ] },
      { p: "Removing an extra keeps it on tickets that already have it." },
    ],
  },
  {
    id: "words", group: "The sections", title: "Words",
    blocks: [
      { h: "What clients call your staff" },
      { p: "Choose Stylist, Nail technician, Barber, Therapist, Esthetician, Groomer, Artist or Team member. The kiosk uses it on the staff, review and ticket screens, in every language." },
      { h: "Your own words" },
      { list: [
        "Each box is one sentence on the kiosk. The grey text is what it says now.",
        "Leave a box empty to keep the kiosk's own words.",
        "{name} becomes the client's first name.",
        "\"Other languages\" lets you write the sentence in Spanish, Vietnamese, Chinese and Korean. A language you leave empty shows your English.",
      ] },
    ],
  },
  {
    id: "configurations", group: "The sections", title: "Configurations",
    blocks: [
      { p: "A configuration is a whole kiosk design saved under a name, like \"Spring menu\". Open Configurations at the top." },
      { list: [
        "Save this design: saves your draft as it is now.",
        "Load: puts a saved design into your draft (your kiosk doesn't change until you publish).",
        "Export: downloads the design as a file, to keep or to use at another location.",
        "Import: loads a file someone exported. Buttons and tap spots are matched to your own services by name; anything not on your menu is listed, and missing Kiosk Extras are made for you.",
        "Rename and Delete do what they say.",
      ] },
      { h: "Start over" },
      { p: "\"Start over from a business-type design\" at the bottom replaces your whole draft with Certxa's design for that kind of business. Save your design first if you might want it back." },
    ],
  },

  // ── How do I… ───────────────────────────────────────────────────────────────
  {
    id: "recipe-shapes", group: "How do I…", title: "Make a nail-shape screen",
    blocks: [
      { p: "Clients pick their service, then tap the shape they want on your own picture. Most shapes are free, a few cost extra." },
      { steps: [
        "Service screens › choose Picture builder.",
        "Press \"Start with a picture screen\" (or \"New picture screen\"), then \"Download template\" and design your shapes picture on it. Turn on \"Show the kiosk footer\" if you want the kiosk's Back and Continue bar.",
        "Upload the picture.",
        "Press \"Add tap spot\", drag it over the first shape and size it. Pick the Add-on tab › New extra: name \"Coffin\", price 5, group \"Nail shape\" › Add and use.",
        "Repeat for every shape (use the same group \"Nail shape\"; free shapes have price 0).",
        "If you didn't turn on the footer, add a tap spot for your Continue and Back (Function tab).",
        "Kiosk Extras › tick \"Clients must choose one\" on Nail shape.",
        "Link to the screen from where clients pick their service: on a picture, a tap spot › Screen; in the Easy builder, a button › Open a screen. Or make it the start screen.",
        "Turn on \"Use my own screens\", try it in Live preview, then Publish.",
      ] },
      { tip: "The shape and its price appear on the client's ticket, so the tech knows what to do and the front desk charges it." },
    ],
  },
  {
    id: "recipe-menu", group: "How do I…", title: "Make a simple menu of my services",
    blocks: [
      { steps: [
        "Service screens › Easy builder › \"Build screens from my catalog\".",
        "Pick each screen in the list and choose a layout (for example 2 across, 3 rows).",
        "Turn on \"Use my own screens\" and pick \"Start\" as the screen clients start on.",
        "Try it in Live preview, then Publish.",
      ] },
    ],
  },
  {
    id: "recipe-welcome", group: "How do I…", title: "Change the welcome picture",
    blocks: [
      { steps: [
        "Make a picture 1080 pixels wide and 1920 tall (standing up).",
        "Welcome screen › Upload picture.",
        "Look at the kiosk on the right; if the language buttons cover something, move that part of your design up.",
        "Publish.",
      ] },
    ],
  },
  {
    id: "recipe-undo", group: "How do I…", title: "Undo a change",
    blocks: [
      { list: [
        "Changed one setting? Change it back; your draft saves by itself.",
        "Want what your kiosk shows now? History › Load the version marked Live. Your draft goes back to it.",
        "Want an older design? History › Load that version, then Publish.",
        "Saved a design under a name? Configurations › Load.",
      ] },
    ],
  },
  {
    id: "recipe-tablet", group: "How do I…", title: "Put the kiosk on a tablet",
    blocks: [
      { p: "The Certxa kiosk shows your published design by itself. For another tablet:" },
      { steps: [
        "Settings › Check-in & Kiosk shows your kiosk's web address and a QR code.",
        "Open that address on the tablet (or scan the QR code), and pair it with your salon's device code when asked.",
        "Leave it on the welcome screen.",
      ] },
      { p: "Open full screen (above the kiosk on the right) shows your draft full size on this computer; it doesn't check anyone in." },
    ],
  },

  // ── More help ───────────────────────────────────────────────────────────────
  {
    id: "glossary", group: "More help", title: "Words you'll see",
    blocks: [
      { list: [
        "Draft: your work in progress. Saves by itself. Not on the kiosk until you publish.",
        "Publish: puts the draft on your kiosk.",
        "Version: a design you published. History keeps them all.",
        "Configuration: a whole design saved under a name; can be exported to a file.",
        "Section: one of the parts on the left (Look, Welcome screen…).",
        "Service screens: your own screens for choosing services.",
        "Easy builder / Picture builder: the two ways to make service screens. A kiosk uses one.",
        "Button: something to tap on an Easy-builder screen.",
        "Tap spot: an invisible button over part of your picture (Picture builder).",
        "Function: what a tap spot does other than choose something: Continue, Back or Start over.",
        "Kiosk Extra: a kiosk-only choice, like a nail shape, free or with a price.",
        "Group: Kiosk Extras of one kind (Nail shape); clients pick one of a group.",
        "Footer: the kiosk's bar at the bottom: Back, what was chosen, total, Continue.",
        "Live preview: the kiosk on the right, working like the real one, without checking anyone in.",
      ] },
    ],
  },
  {
    id: "trouble", group: "More help", title: "Something isn't working",
    blocks: [
      { h: "My changes don't show on the kiosk" },
      { p: "Press Publish. The kiosk changes the next time no one is using it, usually within a few minutes." },
      { h: "A button says \"Not on your menu\"" },
      { p: "Its service or extra was deleted or hidden. Tap the button and remove it, or point it at another service. Clients never see it; the kiosk leaves a gap." },
      { h: "Clients can't get past my picture screen" },
      { p: "It needs a way to move on: a tap spot set to Continue, or the footer turned on. Look for the orange notes under the screen's settings." },
      { h: "The price on my picture is wrong" },
      { p: "The picture is your artwork, so change the picture. Clients are always charged your real price, and the review screen shows it before they check in." },
      { h: "My picture looks stretched" },
      { p: "It isn't 1080 × 1920. Make it again from the template." },
      { h: "Still stuck?" },
      { p: "Press Support in the menu on the left and we'll help you set it up." },
    ],
  },
];

/** The guide topic for each builder section. */
export const SECTION_HELP: Record<string, HelpTopicId> = {
  look: "look", welcome: "welcome", steps: "steps", screens: "screens", extras: "extras", words: "words",
};
