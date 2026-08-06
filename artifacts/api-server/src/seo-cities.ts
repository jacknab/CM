export interface SeoCity {
  city: string;
  state: string;
  stateCode: string;
  country: "US" | "CA";
  nearbyCities?: string;
}

export const MAJOR_US_CITIES: SeoCity[] = [
  { city: "New York",       state: "New York",        stateCode: "NY", country: "US", nearbyCities: "Brooklyn, Queens, Bronx, Newark, Jersey City" },
  { city: "Los Angeles",    state: "California",       stateCode: "CA", country: "US", nearbyCities: "Long Beach, Pasadena, Burbank, Glendale, Santa Monica" },
  { city: "Chicago",        state: "Illinois",         stateCode: "IL", country: "US", nearbyCities: "Evanston, Oak Park, Naperville, Aurora, Joliet" },
  { city: "Houston",        state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Sugar Land, The Woodlands, Pasadena, Pearland, Katy" },
  { city: "Phoenix",        state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Scottsdale, Tempe, Mesa, Chandler, Gilbert" },
  { city: "Philadelphia",   state: "Pennsylvania",     stateCode: "PA", country: "US", nearbyCities: "Camden, Chester, Norristown, King of Prussia, Cherry Hill" },
  { city: "San Antonio",    state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "New Braunfels, Schertz, Seguin, Converse, Universal City" },
  { city: "San Diego",      state: "California",       stateCode: "CA", country: "US", nearbyCities: "Chula Vista, El Cajon, Santee, La Mesa, National City" },
  { city: "Dallas",         state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Plano, Frisco, Arlington, Fort Worth, Irving" },
  { city: "Jacksonville",   state: "Florida",          stateCode: "FL", country: "US", nearbyCities: "St. Augustine, Orange Park, Ponte Vedra Beach, Fernandina Beach" },
  { city: "Austin",         state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Round Rock, Cedar Park, Pflugerville, Georgetown, Kyle" },
  { city: "Fort Worth",     state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Arlington, Keller, Southlake, Grapevine, Bedford" },
  { city: "Columbus",       state: "Ohio",             stateCode: "OH", country: "US", nearbyCities: "Dublin, Westerville, Grove City, Hilliard, Gahanna" },
  { city: "Charlotte",      state: "North Carolina",   stateCode: "NC", country: "US", nearbyCities: "Concord, Gastonia, Rock Hill, Matthews, Huntersville" },
  { city: "Indianapolis",   state: "Indiana",          stateCode: "IN", country: "US", nearbyCities: "Carmel, Fishers, Noblesville, Greenwood, Avon" },
  { city: "San Francisco",  state: "California",       stateCode: "CA", country: "US", nearbyCities: "Oakland, Berkeley, Daly City, San Mateo, Fremont" },
  { city: "Seattle",        state: "Washington",       stateCode: "WA", country: "US", nearbyCities: "Bellevue, Redmond, Kirkland, Renton, Tacoma" },
  { city: "Denver",         state: "Colorado",         stateCode: "CO", country: "US", nearbyCities: "Aurora, Lakewood, Arvada, Westminster, Broomfield" },
  { city: "Nashville",      state: "Tennessee",        stateCode: "TN", country: "US", nearbyCities: "Murfreesboro, Franklin, Brentwood, Smyrna, Hendersonville" },
  { city: "Oklahoma City",  state: "Oklahoma",         stateCode: "OK", country: "US", nearbyCities: "Edmond, Norman, Moore, Midwest City, Yukon" },
  { city: "El Paso",        state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Las Cruces, Socorro, Horizon City, Anthony" },
  { city: "Washington",     state: "District of Columbia", stateCode: "DC", country: "US", nearbyCities: "Arlington, Alexandria, Bethesda, Silver Spring, Rockville" },
  { city: "Las Vegas",      state: "Nevada",           stateCode: "NV", country: "US", nearbyCities: "Henderson, North Las Vegas, Summerlin, Boulder City" },
  { city: "Louisville",     state: "Kentucky",         stateCode: "KY", country: "US", nearbyCities: "Jeffersonville, New Albany, Clarksville, Elizabethtown" },
  { city: "Memphis",        state: "Tennessee",        stateCode: "TN", country: "US", nearbyCities: "Germantown, Bartlett, Collierville, Southaven, Olive Branch" },
  { city: "Portland",       state: "Oregon",           stateCode: "OR", country: "US", nearbyCities: "Beaverton, Gresham, Hillsboro, Lake Oswego, Tigard" },
  { city: "Baltimore",      state: "Maryland",         stateCode: "MD", country: "US", nearbyCities: "Towson, Columbia, Ellicott City, Annapolis, Bowie" },
  { city: "Milwaukee",      state: "Wisconsin",        stateCode: "WI", country: "US", nearbyCities: "Waukesha, Wauwatosa, West Allis, Brookfield, Greenfield" },
  { city: "Albuquerque",    state: "New Mexico",       stateCode: "NM", country: "US", nearbyCities: "Rio Rancho, Bernalillo, Los Lunas, Corrales" },
  { city: "Tucson",         state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Marana, Sahuarita, Oro Valley, South Tucson" },
  { city: "Fresno",         state: "California",       stateCode: "CA", country: "US", nearbyCities: "Clovis, Sanger, Reedley, Selma, Madera" },
  { city: "Sacramento",     state: "California",       stateCode: "CA", country: "US", nearbyCities: "Elk Grove, Roseville, Folsom, Citrus Heights, Rancho Cordova" },
  { city: "Mesa",           state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Chandler, Gilbert, Scottsdale, Tempe, Queen Creek" },
  { city: "Kansas City",    state: "Missouri",         stateCode: "MO", country: "US", nearbyCities: "Overland Park, Olathe, Independence, Lee's Summit, Blue Springs" },
  { city: "Atlanta",        state: "Georgia",          stateCode: "GA", country: "US", nearbyCities: "Sandy Springs, Marietta, Roswell, Alpharetta, Decatur" },
  { city: "Omaha",          state: "Nebraska",         stateCode: "NE", country: "US", nearbyCities: "Bellevue, Council Bluffs, Papillion, La Vista, Ralston" },
  { city: "Colorado Springs", state: "Colorado",       stateCode: "CO", country: "US", nearbyCities: "Pueblo, Fountain, Manitou Springs, Monument, Castle Rock" },
  { city: "Raleigh",        state: "North Carolina",   stateCode: "NC", country: "US", nearbyCities: "Durham, Cary, Chapel Hill, Morrisville, Apex" },
  { city: "Long Beach",     state: "California",       stateCode: "CA", country: "US", nearbyCities: "Compton, Carson, Lakewood, Torrance, Signal Hill" },
  { city: "Virginia Beach", state: "Virginia",         stateCode: "VA", country: "US", nearbyCities: "Norfolk, Chesapeake, Portsmouth, Hampton, Newport News" },
  { city: "Minneapolis",    state: "Minnesota",        stateCode: "MN", country: "US", nearbyCities: "St. Paul, Bloomington, Plymouth, Brooklyn Park, Maple Grove" },
  { city: "Tampa",          state: "Florida",          stateCode: "FL", country: "US", nearbyCities: "St. Petersburg, Clearwater, Brandon, Lakeland, Sarasota" },
  { city: "New Orleans",    state: "Louisiana",        stateCode: "LA", country: "US", nearbyCities: "Metairie, Kenner, Harvey, Gretna, Chalmette" },
  { city: "Arlington",      state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Mansfield, Grand Prairie, Euless, Bedford, Hurst" },
  { city: "Bakersfield",    state: "California",       stateCode: "CA", country: "US", nearbyCities: "Delano, Wasco, Shafter, Tehachapi, McFarland" },
  { city: "Honolulu",       state: "Hawaii",           stateCode: "HI", country: "US", nearbyCities: "Pearl City, Kailua, Mililani, Aiea, Kaneohe" },
  { city: "Anaheim",        state: "California",       stateCode: "CA", country: "US", nearbyCities: "Santa Ana, Orange, Garden Grove, Fullerton, Buena Park" },
  { city: "Aurora",         state: "Colorado",         stateCode: "CO", country: "US", nearbyCities: "Centennial, Parker, Englewood, Littleton, Lakewood" },
  { city: "Santa Ana",      state: "California",       stateCode: "CA", country: "US", nearbyCities: "Irvine, Costa Mesa, Tustin, Garden Grove, Orange" },
  { city: "Corpus Christi", state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Portland, Rockport, Kingsville, Alice" },
  { city: "Riverside",      state: "California",       stateCode: "CA", country: "US", nearbyCities: "Corona, Moreno Valley, Ontario, Redlands, San Bernardino" },
  { city: "Lexington",      state: "Kentucky",         stateCode: "KY", country: "US", nearbyCities: "Georgetown, Nicholasville, Richmond, Paris, Versailles" },
  { city: "Pittsburgh",     state: "Pennsylvania",     stateCode: "PA", country: "US", nearbyCities: "McKeesport, Bethel Park, Monroeville, Mt. Lebanon, Cranberry" },
  { city: "Stockton",       state: "California",       stateCode: "CA", country: "US", nearbyCities: "Lodi, Modesto, Tracy, Manteca, Turlock" },
  { city: "St. Louis",      state: "Missouri",         stateCode: "MO", country: "US", nearbyCities: "Clayton, Florissant, Chesterfield, Kirkwood, Belleville" },
  { city: "St. Paul",       state: "Minnesota",        stateCode: "MN", country: "US", nearbyCities: "Minneapolis, Roseville, Maplewood, Woodbury, Eagan" },
  { city: "Cincinnati",     state: "Ohio",             stateCode: "OH", country: "US", nearbyCities: "Covington, Florence, Norwood, Hamilton, Mason" },
  { city: "Greensboro",     state: "North Carolina",   stateCode: "NC", country: "US", nearbyCities: "High Point, Winston-Salem, Burlington, Asheboro" },
  { city: "Lincoln",        state: "Nebraska",         stateCode: "NE", country: "US", nearbyCities: "Omaha, Fremont, Seward, Beatrice, York" },
  { city: "Plano",          state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Allen, Richardson, McKinney, Frisco, Garland" },
  { city: "Orlando",        state: "Florida",          stateCode: "FL", country: "US", nearbyCities: "Kissimmee, Sanford, Apopka, Winter Garden, Ocoee" },
  { city: "Irvine",         state: "California",       stateCode: "CA", country: "US", nearbyCities: "Newport Beach, Lake Forest, Mission Viejo, Laguna Niguel" },
  { city: "Newark",         state: "New Jersey",       stateCode: "NJ", country: "US", nearbyCities: "Elizabeth, Jersey City, Hoboken, Paterson, Clifton" },
  { city: "Durham",         state: "North Carolina",   stateCode: "NC", country: "US", nearbyCities: "Chapel Hill, Raleigh, Cary, Morrisville, Apex" },
  { city: "Chandler",       state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Mesa, Gilbert, Tempe, Scottsdale, Queen Creek" },
  { city: "Laredo",         state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Nuevo Laredo, Zapata, Eagle Pass" },
  { city: "Madison",        state: "Wisconsin",        stateCode: "WI", country: "US", nearbyCities: "Fitchburg, Middleton, Monona, Stoughton, Sun Prairie" },
  { city: "Lubbock",        state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Wolfforth, Shallowater, Slaton, Levelland" },
  { city: "Scottsdale",     state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Phoenix, Tempe, Mesa, Chandler, Gilbert" },
  { city: "Glendale",       state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Peoria, Surprise, Avondale, Goodyear, Tempe" },
  { city: "Baton Rouge",    state: "Louisiana",        stateCode: "LA", country: "US", nearbyCities: "Gonzales, Denham Springs, Baker, Zachary, Prairieville" },
  { city: "Reno",           state: "Nevada",           stateCode: "NV", country: "US", nearbyCities: "Sparks, Carson City, Fernley, Dayton" },
  { city: "Norfolk",        state: "Virginia",         stateCode: "VA", country: "US", nearbyCities: "Virginia Beach, Chesapeake, Hampton, Portsmouth, Suffolk" },
  { city: "Irving",         state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Coppell, Grapevine, Grand Prairie, Carrollton, Las Colinas" },
  { city: "Chesapeake",     state: "Virginia",         stateCode: "VA", country: "US", nearbyCities: "Norfolk, Virginia Beach, Suffolk, Portsmouth, Hampton" },
  { city: "Fremont",        state: "California",       stateCode: "CA", country: "US", nearbyCities: "Newark, Union City, Hayward, Milpitas, San Jose" },
  { city: "Gilbert",        state: "Arizona",          stateCode: "AZ", country: "US", nearbyCities: "Chandler, Mesa, Tempe, Queen Creek, San Tan Valley" },
  { city: "Winston-Salem",  state: "North Carolina",   stateCode: "NC", country: "US", nearbyCities: "High Point, Greensboro, Kernersville, Clemmons, Lewisville" },
  { city: "North Las Vegas", state: "Nevada",          stateCode: "NV", country: "US", nearbyCities: "Las Vegas, Henderson, Summerlin, Boulder City" },
  { city: "Garland",        state: "Texas",            stateCode: "TX", country: "US", nearbyCities: "Rowlett, Mesquite, Richardson, Sachse, Wylie" },
  { city: "Henderson",      state: "Nevada",           stateCode: "NV", country: "US", nearbyCities: "Las Vegas, Boulder City, North Las Vegas, Summerlin" },
  { city: "Tampa",          state: "Florida",          stateCode: "FL", country: "US", nearbyCities: "St. Petersburg, Clearwater, Brandon, Lakeland, Sarasota" },
  { city: "Miami",          state: "Florida",          stateCode: "FL", country: "US", nearbyCities: "Hialeah, Coral Gables, Miami Beach, Doral, Homestead" },
  { city: "Jersey City",    state: "New Jersey",       stateCode: "NJ", country: "US", nearbyCities: "Hoboken, Newark, Bayonne, Union City, Weehawken" },
  { city: "Buffalo",        state: "New York",         stateCode: "NY", country: "US", nearbyCities: "Cheektowaga, Amherst, Tonawanda, Lackawanna, Niagara Falls" },
  { city: "Richmond",       state: "Virginia",         stateCode: "VA", country: "US", nearbyCities: "Henrico, Chesterfield, Midlothian, Colonial Heights, Petersburg" },
  { city: "Spokane",        state: "Washington",       stateCode: "WA", country: "US", nearbyCities: "Spokane Valley, Coeur d'Alene, Post Falls, Liberty Lake" },
  { city: "Rochester",      state: "New York",         stateCode: "NY", country: "US", nearbyCities: "Brighton, Irondequoit, Greece, Gates, Henrietta" },
  { city: "Des Moines",     state: "Iowa",             stateCode: "IA", country: "US", nearbyCities: "West Des Moines, Ankeny, Urbandale, Johnston, Clive" },
  { city: "Modesto",        state: "California",       stateCode: "CA", country: "US", nearbyCities: "Turlock, Ceres, Salida, Riverbank, Oakdale" },
  { city: "Fayetteville",   state: "North Carolina",   stateCode: "NC", country: "US", nearbyCities: "Spring Lake, Hope Mills, Raeford, Lumberton" },
  { city: "Tacoma",         state: "Washington",       stateCode: "WA", country: "US", nearbyCities: "Lakewood, Puyallup, Federal Way, Bonney Lake, Auburn" },
  { city: "Akron",          state: "Ohio",             stateCode: "OH", country: "US", nearbyCities: "Canton, Fairlawn, Cuyahoga Falls, Stow, Barberton" },
  { city: "Shreveport",     state: "Louisiana",        stateCode: "LA", country: "US", nearbyCities: "Bossier City, Benton, Haughton, Minden" },
  { city: "Augusta",        state: "Georgia",          stateCode: "GA", country: "US", nearbyCities: "Martinez, Evans, North Augusta, Aiken, Grovetown" },
  { city: "Salt Lake City", state: "Utah",             stateCode: "UT", country: "US", nearbyCities: "Sandy, West Valley City, Provo, Ogden, Layton" },
  { city: "Huntington Beach", state: "California",     stateCode: "CA", country: "US", nearbyCities: "Fountain Valley, Costa Mesa, Westminster, Garden Grove" },
  { city: "Birmingham",     state: "Alabama",          stateCode: "AL", country: "US", nearbyCities: "Hoover, Vestavia Hills, Mountain Brook, Homewood, Bessemer" },
  { city: "Little Rock",    state: "Arkansas",         stateCode: "AR", country: "US", nearbyCities: "North Little Rock, Conway, Benton, Bryant, Maumelle" },
  { city: "Grand Rapids",   state: "Michigan",         stateCode: "MI", country: "US", nearbyCities: "Wyoming, Kentwood, Walker, Grandville, Holland" },
  { city: "Knoxville",      state: "Tennessee",        stateCode: "TN", country: "US", nearbyCities: "Maryville, Oak Ridge, Farragut, Clinton, Jefferson City" },
  { city: "Providence",     state: "Rhode Island",     stateCode: "RI", country: "US", nearbyCities: "Cranston, Pawtucket, Woonsocket, North Providence, Johnston" },
];

export const MAJOR_CA_CITIES: SeoCity[] = [
  { city: "Toronto",        state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Mississauga, Brampton, Markham, Vaughan, Richmond Hill" },
  { city: "Montreal",       state: "Quebec",           stateCode: "QC", country: "CA", nearbyCities: "Laval, Longueuil, Brossard, Blainville, Repentigny" },
  { city: "Vancouver",      state: "British Columbia", stateCode: "BC", country: "CA", nearbyCities: "Surrey, Burnaby, Richmond, Coquitlam, Langley" },
  { city: "Calgary",        state: "Alberta",          stateCode: "AB", country: "CA", nearbyCities: "Airdrie, Cochrane, Okotoks, Chestermere, High River" },
  { city: "Edmonton",       state: "Alberta",          stateCode: "AB", country: "CA", nearbyCities: "St. Albert, Sherwood Park, Spruce Grove, Leduc, Fort Saskatchewan" },
  { city: "Ottawa",         state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Gatineau, Kanata, Orleans, Nepean, Gloucester" },
  { city: "Winnipeg",       state: "Manitoba",         stateCode: "MB", country: "CA", nearbyCities: "St. Boniface, Transcona, Portage la Prairie, Steinbach" },
  { city: "Mississauga",    state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Brampton, Oakville, Toronto, Milton, Burlington" },
  { city: "Brampton",       state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Mississauga, Caledon, Bolton, Georgetown, Etobicoke" },
  { city: "Hamilton",       state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Burlington, Stoney Creek, Ancaster, Dundas, Brantford" },
  { city: "Surrey",         state: "British Columbia", stateCode: "BC", country: "CA", nearbyCities: "Langley, Delta, White Rock, Cloverdale, Newton" },
  { city: "Laval",          state: "Quebec",           stateCode: "QC", country: "CA", nearbyCities: "Montreal, Terrebonne, Longueuil, Brossard, Blainville" },
  { city: "Halifax",        state: "Nova Scotia",      stateCode: "NS", country: "CA", nearbyCities: "Dartmouth, Bedford, Fall River, Cole Harbour, Sackville" },
  { city: "London",         state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "St. Thomas, Woodstock, Ingersoll, Strathroy, Tillsonburg" },
  { city: "Markham",        state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Scarborough, Pickering, Richmond Hill, Vaughan, Whitby" },
  { city: "Vaughan",        state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Woodbridge, Maple, Thornhill, Richmond Hill, Kleinburg" },
  { city: "Kitchener",      state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "Waterloo, Cambridge, Guelph, Elmira, New Hamburg" },
  { city: "Saskatoon",      state: "Saskatchewan",     stateCode: "SK", country: "CA", nearbyCities: "Warman, Martensville, Dalmeny, Osler" },
  { city: "Windsor",        state: "Ontario",          stateCode: "ON", country: "CA", nearbyCities: "LaSalle, Tecumseh, Lakeshore, Amherstburg, Essex" },
  { city: "Regina",         state: "Saskatchewan",     stateCode: "SK", country: "CA", nearbyCities: "White City, Emerald Park, Balgonie, Pilot Butte" },
];

export const ALL_CITIES = [...MAJOR_US_CITIES, ...MAJOR_CA_CITIES];

export const BOOKING_BUSINESS_TYPES = [
  "Hair Salons",
  "Barber Shops",
  "Nail Salons",
  "Spas & Massage",
  "Estheticians",
  "Tattoo Studios",
  "Pet Groomers",
  "Personal Trainers",
  "Yoga Studios",
  "Pilates Studios",
  "Lash Studios",
  "Eyebrow & Threading",
  "Medical Aesthetics",
  "Physical Therapy",
  "Chiropractic Offices",
  "Dance Studios",
  "Tutoring Services",
  "Dental Offices",
];

export function businessTypeToSlug(businessType: string): string {
  return businessType
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export function buildRegionSlug(city: string, stateCode: string, businessType?: string | null, product?: string): string {
  const c = city.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const s = stateCode.toLowerCase().replace(/[^a-z]/g, "");
  if (businessType) {
    return `${c}-${s}-${businessTypeToSlug(businessType)}`;
  }
  const p = product && product !== "all" ? `-${product}` : "";
  return `${c}-${s}${p}`;
}
