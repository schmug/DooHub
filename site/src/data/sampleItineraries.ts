import type { Itinerary } from "../types";

// Placeholder/sample itineraries so the Itineraries tab renders pre-data.
// Each is a same-day Triangle outing built from sampleEvents.ts ids.

export const sampleItineraries: Itinerary[] = [
  {
    id: "itin-raleigh-family-sat",
    title: "Raleigh Family Saturday",
    theme: "Family · low-cost · mostly outdoor",
    anchor_city: "Raleigh",
    drive_time: "All stops within 10 min of downtown",
    weather: { summary: "Sunny", temp_f: 84 },
    cost_range: "$0–$25 / person",
    date: "2026-06-20",
    overview:
      "A laid-back day for families: carousel and pedal boats in the morning, a slow downtown afternoon, then free live jazz on the museum lawn at golden hour.",
    schedule: {
      morning: [
        { time: "10:00 AM", title: "Pullen Park — carousel, train & pedal boats", event_id: "sample-pullen-park", location: "520 Ashe Ave, Raleigh", price: "Rides $1.50 each" },
      ],
      afternoon: [
        { time: "1:00 PM", title: "Lunch on Hillsborough St", location: "Raleigh", price: "$10–$15" },
        { time: "2:30 PM", title: "Stroll NC State's Court of North Carolina / nap break", location: "Raleigh", notes: "Shade and benches if it's hot." },
      ],
      evening: [
        { time: "6:00 PM", title: "Art in the Evening: Jazz on the Lawn", event_id: "sample-ncma-art-evening", location: "NC Museum of Art", price: "Free" },
      ],
    },
    food: [
      { slot: "lunch", place: "Jubala Coffee / Hibachi Xpress", city: "Raleigh", vegan_dish: "Veggie rice bowl, no egg", vegetarian_dish: "Grilled cheese + tomato soup", price: "$" },
      { slot: "dinner", place: "Picnic at the Museum Park (food trucks on site)", city: "Raleigh", vegan_dish: "Falafel wrap from the lawn truck", vegetarian_dish: "Margherita flatbread", price: "$$" },
    ],
    alternatives: [
      { leg: "Evening lawn concert", good_weather: "Spread a blanket near the amphitheater stage.", rain: "Move indoors to the free NCMA West Building galleries until close." },
    ],
    practical_notes: [
      "Pullen Park lots fill by 11 AM on sunny weekends — arrive early or park on Ashe Ave.",
      "NCMA Museum Park is free; bring a blanket and low chairs.",
      "Suggested departure from downtown Raleigh: 9:40 AM.",
    ],
    event_ids: ["sample-pullen-park", "sample-ncma-art-evening"],
  },
  {
    id: "itin-durham-market-brewery",
    title: "Durham Market-to-Brewery Crawl",
    theme: "Local food · 21+ friendly · walkable",
    anchor_city: "Durham",
    drive_time: "~7 min between stops",
    weather: { summary: "Partly cloudy", temp_f: 85 },
    cost_range: "$20–$45 / person",
    date: "2026-06-20",
    overview:
      "Graze the Durham Farmers' Market in the cool of the morning, regroup over a long lunch downtown, then close with rooftop flights at Ponysaurus.",
    schedule: {
      morning: [
        { time: "8:30 AM", title: "Durham Farmers' Market", event_id: "sample-durham-farmers-market", location: "Durham Central Park", price: "Free entry" },
      ],
      afternoon: [
        { time: "12:30 PM", title: "Lunch in downtown Durham", location: "Durham", price: "$12–$18" },
        { time: "3:00 PM", title: "Ponysaurus Brewing — flights & food truck", event_id: "sample-ponysaurus-tasting", location: "219 Hood St, Durham", price: "Flights $12" },
      ],
      evening: [
        { time: "6:00 PM", title: "Optional: drive to Raleigh for NCMA jazz", event_id: "sample-ncma-art-evening", location: "NC Museum of Art", price: "Free", notes: "25 min west; only if you skipped a long lunch." },
      ],
    },
    food: [
      { slot: "breakfast", place: "Market stalls (Scratch pastries, cold brew)", city: "Durham", vegan_dish: "Vegan kolache", vegetarian_dish: "Cheese danish", price: "$" },
      { slot: "lunch", place: "Pizzeria Toro", city: "Durham", vegan_dish: "Marinara + roasted-veg pie, no cheese", vegetarian_dish: "Margherita", price: "$$" },
      { slot: "dinner", place: "Ponysaurus food truck", city: "Durham", vegan_dish: "Jackfruit taco", vegetarian_dish: "Black bean quesadilla", price: "$$" },
    ],
    alternatives: [
      { leg: "Ponysaurus rooftop", good_weather: "Grab the rooftop patio for skyline views.", rain: "Head down to the heated indoor taproom — same taps, covered seating." },
    ],
    practical_notes: [
      "Market runs 8 AM–12 PM; come hungry and bring a tote + cash for some vendors.",
      "Free street parking near Foster St fills fast — the Durham Central Park deck is a safe bet.",
      "Suggested departure from downtown Durham: 8:15 AM.",
    ],
    event_ids: ["sample-durham-farmers-market", "sample-ponysaurus-tasting"],
  },
  {
    id: "itin-durham-gardens-baseball",
    title: "Gardens by Day, Bulls by Night",
    theme: "Nature + sports · all ages",
    anchor_city: "Durham",
    drive_time: "~10 min Duke ↔ DBAP",
    weather: { summary: "Mostly sunny", temp_f: 86 },
    cost_range: "$15–$40 / person",
    date: "2026-06-21",
    overview:
      "A docent-led morning through Duke Gardens, a shaded lunch, then Triple-A baseball under the Bull sign as the day cools off.",
    schedule: {
      morning: [
        { time: "10:00 AM", title: "Sarah P. Duke Gardens guided walk", event_id: "sample-duke-gardens-tour", location: "420 Anderson St, Durham", price: "Free (parking $2/hr)" },
      ],
      afternoon: [
        { time: "12:30 PM", title: "Lunch in Brightleaf / Ninth St", location: "Durham", price: "$12–$20" },
        { time: "2:30 PM", title: "Rest / AC break before the game", location: "Durham" },
      ],
      evening: [
        { time: "5:05 PM", title: "Durham Bulls vs. Norfolk Tides", event_id: "sample-bulls-game", location: "Durham Bulls Athletic Park", price: "$12–$30" },
      ],
    },
    food: [
      { slot: "lunch", place: "Guglhupf Bakery & Café", city: "Durham", vegan_dish: "Roasted veg + hummus sandwich", vegetarian_dish: "Brezel + cheese plate", price: "$$" },
      { slot: "dinner", place: "DBAP concourse", city: "Durham", vegan_dish: "Beyond burger (ask for no mayo)", vegetarian_dish: "Veggie dog + fries", price: "$$" },
    ],
    alternatives: [
      { leg: "Gardens walk", good_weather: "Do the full Asiatic Arboretum loop.", rain: "Shorten to the Terraces and the covered Doris Duke Center; tours run rain or shine." },
      { leg: "Ballgame", good_weather: "Lawn seats in the outfield.", rain: "Covered concourse seats stay dry; games delay rather than cancel." },
    ],
    practical_notes: [
      "Duke Gardens free tours are first-come — arrive 10 min early at the Doris Duke Center.",
      "DBAP gates open 90 min before first pitch; the American Tobacco deck is closest.",
      "Suggested departure from downtown Durham: 9:40 AM.",
    ],
    event_ids: ["sample-duke-gardens-tour", "sample-bulls-game"],
  },
  {
    id: "itin-carrboro-indie-night",
    title: "Carrboro Indie Night",
    theme: "Date-night · music · 21+",
    anchor_city: "Carrboro",
    drive_time: "~30 min from Raleigh",
    weather: { summary: "Clear", temp_f: 74 },
    cost_range: "$35–$60 / person",
    date: "2026-06-21",
    overview:
      "An easy evening on the Carrboro/Chapel Hill line: early dinner on Franklin Street, then a triple bill at the legendary Cat's Cradle.",
    schedule: {
      morning: [],
      afternoon: [
        { time: "5:30 PM", title: "Dinner on Franklin St, Chapel Hill", location: "Chapel Hill", price: "$15–$25" },
      ],
      evening: [
        { time: "8:00 PM", title: "Indie Night at Cat's Cradle", event_id: "sample-cats-cradle-show", location: "300 E Main St, Carrboro", price: "$25 adv" },
      ],
    },
    food: [
      { slot: "dinner", place: "Mediterranean Deli or Vimala's Curryblossom", city: "Chapel Hill", vegan_dish: "Falafel + tabbouleh plate", vegetarian_dish: "Saag paneer + naan", price: "$$" },
    ],
    alternatives: [
      { leg: "Pre-show", good_weather: "Walk Weaver Street Market lawn before doors.", rain: "Coffee + records at All Day Records next door." },
    ],
    practical_notes: [
      "Buy tickets in advance — Cat's Cradle shows sell out.",
      "Free parking behind the venue off Main St; rideshare is easy back to Raleigh.",
      "Suggested departure from Raleigh: 4:45 PM.",
    ],
    event_ids: ["sample-cats-cradle-show"],
  },
  {
    id: "itin-science-broadway-wed",
    title: "Science by Day, Broadway by Night",
    theme: "Indoor · culture · rain-proof",
    anchor_city: "Raleigh → Durham",
    drive_time: "~25 min Raleigh ↔ DPAC",
    weather: { summary: "Scattered storms", temp_f: 88 },
    cost_range: "$49–$140 / person",
    date: "2026-06-24",
    overview:
      "A fully indoor, weather-proof culture day: free dinosaurs and live animals at the Natural Sciences museum, then Hadestown at DPAC.",
    schedule: {
      morning: [
        { time: "9:30 AM", title: "NC Museum of Natural Sciences — Dinosaur Day", event_id: "sample-natural-sciences", location: "11 W Jones St, Raleigh", price: "Free" },
      ],
      afternoon: [
        { time: "1:00 PM", title: "Lunch downtown + State Capitol grounds", location: "Raleigh", price: "$12–$18" },
        { time: "4:30 PM", title: "Drive to Durham, check in / early dinner", location: "Durham" },
      ],
      evening: [
        { time: "7:30 PM", title: "Broadway at DPAC: Hadestown", event_id: "sample-dpac-broadway", location: "Durham Performing Arts Center", price: "$49–$129" },
      ],
    },
    food: [
      { slot: "lunch", place: "Garland or Vidrio", city: "Raleigh", vegan_dish: "Chana masala bowl", vegetarian_dish: "Mezze spread", price: "$$" },
      { slot: "dinner", place: "Nana Taco / M Sushi (near DPAC)", city: "Durham", vegan_dish: "Sweet-potato taco", vegetarian_dish: "Avocado roll set", price: "$$" },
    ],
    alternatives: [
      { leg: "Entire day", good_weather: "Add a walk on the American Tobacco Trail boardwalk before the show.", rain: "No change needed — both anchors are indoors." },
    ],
    practical_notes: [
      "Museum is free and open 9 AM–5 PM; the live butterfly conservatory closes at 4:30.",
      "DPAC parking decks (Durham Centre, ATC) sell out for Broadway nights — pre-book.",
      "Suggested departure from downtown Raleigh: 9:10 AM.",
    ],
    event_ids: ["sample-natural-sciences", "sample-dpac-broadway"],
  },
];
