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
      { p: "A kiosk configuration is one design of your check-in kiosk. You make it with one of two builders:" },
      { list: [
        "Easy builder: Certxa draws the screens from your services. You choose what shows and change the words and colours.",
        "Picture builder: you design the screens as pictures and place tap spots on them.",
      ] },
      { steps: [
        "On \"Your kiosk configurations\", press \"New kiosk configuration\", give it a name, then choose a builder.",
        "Pick a screen in the tabs at the top. The kiosk in the middle shows that screen.",
        "Click the part you want to change. Its setting opens on the right. Changes save by themselves.",
        "Press \"Put on my kiosk\" (top right) to show it on the kiosk in your salon.",
      ] },
      { tip: "A configuration keeps its builder. To try the other builder, make another configuration." },
      { see: [{ topic: "publish", label: "Putting it on your kiosk" }, { topic: "builders", label: "Which builder should I use?" }] },
    ],
  },
  {
    id: "publish", group: "Getting started", title: "Putting it on your kiosk",
    blocks: [
      { p: "Your changes save by themselves but stay in the configuration. \"Put on my kiosk\" puts the configuration on the kiosk in your salon. It switches the next time no one is using it, usually within a few minutes." },
      { p: "The configuration on your kiosk is marked \"On your kiosk now\" in your list. After you change it, press \"Update my kiosk\"." },
      { p: "To go back to another design, open your list and press \"Put on my kiosk\" on that configuration." },
      { see: [{ topic: "configurations", label: "Your kiosk configurations" }] },
    ],
  },

  // ── The sections ─────────────────────────────────────────────────────────────
  {
    id: "look", group: "The sections", title: "Colours & style",
    blocks: [
      { p: "Press \"Colours & style\" at the right end of the screen tabs. It changes every screen." },
      { list: [
        "Classic: lavender and rose, rounded buttons.",
        "Boutique: cream and copper with elegant headings. Nail salons start with this one.",
        "Your own colours: buttons, background, cards and text. Reset puts the style's colour back.",
      ] },
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
    id: "steps", group: "The sections", title: "Turning screens on and off",
    blocks: [
      { p: "Clients go through the screens in the order of the tabs. Some screens can be switched off on their tab:" },
      { list: [
        "Categories › \"Show this screen\" (Easy builder): off sends clients straight to one list of all your services.",
        "Services › \"Nail questions\" (Easy builder): asks length, shape and design for services set up in Catalog › Nail Config.",
        "Add-ons › \"Show this screen\".",
        "Staff › \"Show this screen\". Only staff who are clocked in and free are shown.",
      ] },
      { p: "\"Order after Services\" (on the Add-ons and Staff tabs) decides which of those comes first. A screen with nothing to show is skipped by itself." },
      { h: "How many services" },
      { p: "On the Services tab (Easy builder) or the Your screens tab (Picture builder): how many services one client can pick (1 to 3) and the longest visit. Longer visits are booked at the front desk." },
    ],
  },
  {
    id: "screens", group: "The sections", title: "Your own screens",
    blocks: [
      { h: "Easy builder" },
      { p: "Categories tab › \"My own screens\" lets you lay out buttons like a POS grid instead of the category cards. \"Category cards\" puts the cards back (your screens are kept)." },
      { h: "Picture builder" },
      { p: "The \"Your screens\" tab holds your pictures. Until you make one, the kiosk shows the category cards." },
      { h: "On every own screen" },
      { list: [
        "Click a button or tap spot to change it; its settings open on the right.",
        "\"On this screen, clients can choose\": One (a new pick replaces the old one) or More than one. Tick \"They must choose something here\" so clients can't move on without a pick.",
        "\"Clients start on\" sets the first screen.",
        "The Screens panel on the left lists your screens: click one to open it, \"New screen\" makes one and asks for its name, \"Delete screen\" removes the open one.",
        "Live preview lets you tap through it like a client.",
      ] },
      { see: [{ topic: "easy", label: "Easy builder" }, { topic: "picture", label: "Picture builder" }] },
    ],
  },
  {
    id: "builders", group: "The sections", title: "Which builder should I use?",
    blocks: [
      { h: "Easy builder" },
      { p: "Certxa draws the screens from your services: category cards, or your own grids of buttons. Each button shows the service's name, picture and price from your catalog, so when you change a price the kiosk changes too. Best for most businesses." },
      { h: "Picture builder" },
      { p: "You design each screen as a picture (in Canva, Photoshop or by a designer), upload it, and mark the parts clients tap. Full control of the look, like the nail-shape guide many salons hang on the wall." },
      { tip: "On a picture, names and prices are part of the artwork. If you change a price, change the picture too. (The client is always charged your real price; the review screen shows it before they check in.)" },
      { p: "You choose the builder when you make a configuration, and it keeps it. To try the other one, make another configuration." },
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
        "Tap a button to change its name or picture, open the screen it links to, or remove it. For a service or extra, \"Then…\" decides where the client goes after tapping it.",
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
        "Choose what it does: a Service, an Add-on or Kiosk Extra, a Function (Continue, Go to Staff, Finish, Back, Start over) or a Screen to open.",
        "For a service, add-on or extra, choose \"Then…\": stay on the screen so they can pick more, continue to the next step, go to staff, finish (the review), or open another of your screens.",
      ] },
      { tip: "Example: a nail-shape spot with \"Then… Go to choosing staff\" takes the client straight on as soon as they tap their shape." },
      { h: "3. The footer (optional)" },
      { p: "Turn on \"Show the kiosk footer\" to put the kiosk's own bar at the bottom: Back, what the client chose, the total and Continue. It covers the bottom strip of your picture (marked on the template), so keep tap spots out of it. With the footer on you don't need your own Back and Continue spots." },
      { h: "Warnings" },
      { p: "Orange notes under the settings tell you when clients could get stuck, for example \"add a tap spot set to Continue\". Fix them before you put it on your kiosk." },
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
      ] },
      { p: "Whether clients pick one or several, and whether they must pick, is set on the screen the extras are on." },
      { h: "Where they go" },
      { list: [
        "Make them on the Add-ons tab › Kiosk Extras, or right from a tap spot or button on your own screens.",
        "A client chooses a service first; the extra is added to it.",
        "The choice goes on the client's ticket as its own line, so the tech sees it and the front desk charges it at checkout.",
        "Extras don't show on your booking website or in your normal add-ons.",
      ] },
      { p: "Removing an extra keeps it on tickets that already have it." },
    ],
  },
  {
    id: "words", group: "The sections", title: "Changing the words",
    blocks: [
      { p: "Click a heading or a line of text on a screen; its box opens on the right. Leave it empty to keep the kiosk's own words." },
      { list: [
        "{name} becomes the client's first name.",
        "\"Other languages\" lets you write it in Spanish, Vietnamese, Chinese and Korean. A language you leave empty shows your English.",
        "Staff tab › \"What clients call your staff\": Stylist, Nail technician, Barber and others, in every language at once.",
      ] },
    ],
  },
  {
    id: "configurations", group: "The sections", title: "Your kiosk configurations",
    blocks: [
      { p: "The arrow at the top left of the builder goes back to your list. Each configuration has:" },
      { list: [
        "Edit: opens it in its builder.",
        "Put on my kiosk: shows it on the kiosk in your salon.",
        "Copy: makes a copy to try changes on.",
        "Export: downloads it as a file, to keep or to use at another location.",
        "Rename and Delete. The one on your kiosk can't be deleted.",
      ] },
      { p: "\"Import a file\" adds a configuration someone exported. Buttons and tap spots are matched to your own services by name; anything not on your menu is listed, and missing Kiosk Extras are made for you." },
    ],
  },

  // ── How do I… ───────────────────────────────────────────────────────────────
  {
    id: "recipe-shapes", group: "How do I…", title: "Make a nail-shape screen",
    blocks: [
      { p: "Clients tap the shape they want on your own picture. Most shapes are free, a few cost extra." },
      { steps: [
        "Make a new kiosk configuration with the Picture builder.",
        "Your screens tab › \"Start with a picture screen\", then \"Download template\" and design your shapes picture on it.",
        "Upload the picture. Turn on \"Show the kiosk footer\" if you want the kiosk's Back and Continue bar.",
        "Set \"On this screen, clients can choose\" to One, and tick \"They must choose something here\".",
        "Press \"Add tap spot\", drag it over the first shape and size it. Add-on tab › New extra: name \"Coffin\", price 5 › Add and use.",
        "Repeat for every shape (free shapes have price 0).",
        "If you didn't turn on the footer, add tap spots for Continue and Back (Function tab).",
        "Link to the shapes screen from your services screen with a tap spot › Screen, or use \"Then…\" on each service.",
        "Try it in Live preview, then press \"Put on my kiosk\".",
      ] },
      { tip: "The shape and its price appear on the client's ticket, so the tech knows what to do and the front desk charges it." },
    ],
  },
  {
    id: "recipe-menu", group: "How do I…", title: "Make a simple menu of my services",
    blocks: [
      { steps: [
        "Make a new kiosk configuration with the Easy builder.",
        "Categories tab › \"My own screens\" › \"Build screens from my catalog\".",
        "Pick each screen in the list and choose a layout (for example 2 across, 3 rows).",
        "Try it in Live preview, then press \"Put on my kiosk\".",
      ] },
    ],
  },
  {
    id: "recipe-welcome", group: "How do I…", title: "Change the welcome picture",
    blocks: [
      { steps: [
        "Make a picture 1080 pixels wide and 1920 tall (standing up).",
        "Welcome tab › Upload picture (or click the picture on the screen).",
        "Look at the kiosk; if the language buttons cover something, move that part of your design up.",
        "Press \"Put on my kiosk\" (or \"Update my kiosk\").",
      ] },
    ],
  },
  {
    id: "recipe-undo", group: "How do I…", title: "Undo a change",
    blocks: [
      { list: [
        "Changed one setting? Change it back; it saves by itself.",
        "Want to try changes safely? Copy the configuration first and change the copy.",
        "Want an earlier design back on the kiosk? Press \"Put on my kiosk\" on that configuration in your list.",
      ] },
    ],
  },
  {
    id: "recipe-tablet", group: "How do I…", title: "Put the kiosk on a tablet",
    blocks: [
      { p: "The Certxa kiosk shows the configuration on your kiosk by itself. For another tablet:" },
      { steps: [
        "Settings › Check-in & Kiosk shows your kiosk's web address and a QR code.",
        "Open that address on the tablet (or scan the QR code), and pair it with your salon's device code when asked.",
        "Leave it on the welcome screen.",
      ] },
      { p: "\"Try it full screen\" (above the kiosk) opens the configuration full size to tap through; it doesn't check anyone in." },
    ],
  },

  // ── More help ───────────────────────────────────────────────────────────────
  {
    id: "glossary", group: "More help", title: "Words you'll see",
    blocks: [
      { list: [
        "Kiosk configuration: one whole design of your kiosk, with a name. Saves by itself.",
        "Put on my kiosk: shows a configuration on the kiosk in your salon.",
        "Easy builder / Picture builder: the two ways to make a configuration. Each configuration uses one.",
        "Screen tabs: the kiosk's screens across the top, in the order clients see them.",
        "Own screens: screens you design yourself for choosing services.",
        "Button: something to tap on an Easy-builder screen.",
        "Tap spot: an invisible button over part of your picture (Picture builder).",
        "Function: what a tap spot does other than choose something: Continue, Go to Staff, Finish, Back or Start over.",
        "Kiosk Extra: a kiosk-only choice, like a nail shape, free or with a price.",
        "Footer: the kiosk's bar at the bottom: Back, what was chosen, total, Continue.",
        "Live preview: the kiosk working like the real one, without checking anyone in.",
      ] },
    ],
  },
  {
    id: "trouble", group: "More help", title: "Something isn't working",
    blocks: [
      { h: "My changes don't show on the kiosk" },
      { p: "Press \"Put on my kiosk\" (or \"Update my kiosk\"). The kiosk changes the next time no one is using it, usually within a few minutes. Check the configuration is the one marked \"On your kiosk now\"." },
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
