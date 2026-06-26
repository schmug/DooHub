#!/usr/bin/env -S npx tsx
// One-off seeder: builds data/itineraries.json (Output #2 in CLAUDE.md) from the
// real events in data/events.json. Each itinerary references events by their
// stable id, resolved here by (name substring + date) so ids never drift from
// the store. Narrative content (food picks, notes, rain backups) is curated.
//
// Usage: tsx scripts/seed_itineraries.ts

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { localDate } from "./lib/dedup.js";
import type { EventsStore, Itinerary, ItinerariesStore } from "./lib/types.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "events.json");
const OUT = join(ROOT, "data", "itineraries.json");

const NOW = "2026-06-25T20:30:00-04:00";
const WEEK = "2026-W26";

async function main(): Promise<void> {
  const store = JSON.parse(await readFile(SRC, "utf8")) as EventsStore;

  /** Resolve an event id by name substring + local date. Throws if not unique. */
  const id = (nameIncludes: string, date: string): string => {
    const matches = store.events.filter(
      (e) => e.name.toLowerCase().includes(nameIncludes.toLowerCase()) && localDate(e.start) === date,
    );
    if (matches.length !== 1) {
      throw new Error(`id("${nameIncludes}", ${date}) matched ${matches.length} events (need exactly 1)`);
    }
    return matches[0]!.id;
  };

  const itineraries: Itinerary[] = [
    {
      id: "raleigh-pride-saturday",
      title: "Pride, Art & a Jam Band in Raleigh",
      theme: "Free downtown festival energy capped by a big amphitheater show",
      anchor_city: "Raleigh",
      drive_time: "Everything within ~10 min of downtown",
      weather: { summary: "Partly sunny, PM storms", temp_f: 97 },
      cost_range: "$0–$60 (festival is free; evening concert ticketed)",
      date: "2026-06-27",
      overview:
        "A car-light downtown Raleigh day: free, family-friendly art at the NC Museum of Art in the morning, the Out! Raleigh Pride street festival all afternoon on Fayetteville Street, then jam-band Goose at Red Hat Amphitheater to close the night. It's a hot one — hydrate and plan an AC break midday.",
      schedule: {
        morning: [
          { time: "10:00 AM", title: "America250: Knowing the West Community Day", event_id: id("America250", "2026-06-27"), location: "NC Museum of Art, 2110 Blue Ridge Rd", price: "Free", notes: "Hands-on artmaking, live music, and guided tours — air-conditioned galleries before the heat peaks." },
        ],
        afternoon: [
          { time: "12:00 PM", title: "Out! Raleigh Pride Festival", event_id: id("Out! Raleigh Pride Festival", "2026-06-27"), location: "Fayetteville Street, Downtown Raleigh", price: "Free", notes: "~100 vendors, two stages, kids zone, and a beer garden. Shade is limited — bring a hat and water." },
        ],
        evening: [
          { time: "7:00 PM", title: "An Evening with Goose", event_id: id("Goose", "2026-06-27"), location: "Red Hat Amphitheater, 500 S McDowell St", price: "$54.99", notes: "Outdoor amphitheater two blocks from the festival footprint — easy to roll right over." },
        ],
      },
      food: [
        { slot: "lunch", place: "The Fiction Kitchen", city: "Raleigh", vegan_dish: "Vegan Southern fried 'chicken' & waffles", vegetarian_dish: "Pad Thai bowl", price: "$$", notes: "Fully vegetarian/vegan; a short walk off Fayetteville St. Reserve ahead on festival days." },
        { slot: "dinner", place: "Bida Manda (Laotian)", city: "Raleigh", vegan_dish: "Coconut curry with tofu & vegetables", vegetarian_dish: "Crispy rice lettuce wraps", price: "$$$", notes: "Grab an early table before the show, or graze the festival's beer garden food vendors." },
      ],
      alternatives: [
        { leg: "Afternoon at Out! Raleigh", good_weather: "Stroll the full Fayetteville St footprint and the kids zone", rain: "Duck into the air-conditioned NC Museum of History or Marbles a block away until the pop-up storm passes" },
        { leg: "Evening Goose show", good_weather: "Lawn seating under the stars", rain: "Red Hat is open-air — pack a poncho; storms this week are brief afternoon cells that usually clear by showtime" },
      ],
      practical_notes: [
        "Park once downtown (decks on Wilmington/Blount) and walk the whole day.",
        "Heat advisory territory (mid-90s°F) — refill water and take a midday AC break.",
        "Red Hat doors are typically ~60–90 min before show; bag policy is clear-bag only.",
      ],
      event_ids: [id("America250", "2026-06-27"), id("Out! Raleigh Pride Festival", "2026-06-27"), id("Goose", "2026-06-27")],
    },
    {
      id: "durham-indie-arts",
      title: "Durham Makers, Museums & Dex Fest",
      theme: "Handmade goods, contemporary art, and homegrown indie rock",
      anchor_city: "Durham",
      drive_time: "Durham core + 15 min to Carrboro for the show",
      weather: { summary: "Partly sunny, PM storms", temp_f: 97 },
      cost_range: "$0–$45",
      date: "2026-06-27",
      overview:
        "A creative Durham Saturday: browse 50+ local crafters at Durham Central Park, take in Dyani White Hawk's acclaimed video installation at the Nasher (free), then head to Carrboro for night two of Dex Fest at the legendary Cat's Cradle.",
      schedule: {
        morning: [
          { time: "8:30 AM", title: "Durham Craft Market", event_id: id("Durham Craft Market", "2026-06-27"), location: "Durham Central Park, 501 Foster St", price: "Free", notes: "Beat the heat — go early. Pair it with the adjacent Durham Farmers' Market stalls." },
        ],
        afternoon: [
          { time: "1:00 PM", title: "Dyani White Hawk: LISTEN", event_id: id("Dyani White Hawk", "2026-06-27"), location: "Nasher Museum of Art at Duke, 2001 Campus Dr", price: "Free", notes: "Eight-channel video installation; free admission. Cool, quiet, and air-conditioned." },
        ],
        evening: [
          { time: "7:00 PM", title: "Dex Fest Night Two", event_id: id("Dex Fest Night Two", "2026-06-27"), location: "Cat's Cradle, 300 E Main St, Carrboro", price: "$$", notes: "Doors 6pm. Carrboro is ~15 min west; park on Main St or the East End deck." },
        ],
      },
      food: [
        { slot: "lunch", place: "Pompieri Pizza", city: "Durham", vegan_dish: "Vegan Margherita with house vegan mozzarella", vegetarian_dish: "Wood-fired veggie pie", price: "$$", notes: "Walkable from Durham Central Park; fast and vegan-friendly." },
        { slot: "dinner", place: "Vimala's Curryblossom Cafe", city: "Chapel Hill", vegan_dish: "Chana masala with brown basmati", vegetarian_dish: "Saag paneer thali", price: "$$", notes: "On the way to Carrboro; deep vegan menu. Or grab a vegan deli plate at Weaver Street Market next to the Cradle." },
      ],
      alternatives: [
        { leg: "Morning craft market", good_weather: "Linger at the open-air pavilion and food trucks", rain: "The pavilion is covered; vendors stay open through light rain" },
        { leg: "Travel to Carrboro", good_weather: "Walk Carrboro's Main St before the show", rain: "Cat's Cradle is indoors — no weather worries once you're in" },
      ],
      practical_notes: [
        "Nasher is free but timed-entry on busy days — reserve a slot online.",
        "Dex Fest is a two-room festival; check set times so you don't miss headliners.",
        "Carrboro parking fills on show nights — arrive by 6:15.",
      ],
      event_ids: [id("Durham Craft Market", "2026-06-27"), id("Dyani White Hawk", "2026-06-27"), id("Dex Fest Night Two", "2026-06-27")],
    },
    {
      id: "cary-symphony-under-stars",
      title: "Cary: Market Morning to Symphony Night",
      theme: "Easygoing suburban Saturday, classical music under the stars",
      anchor_city: "Cary",
      drive_time: "All within ~10 min around Cary/Morrisville",
      weather: { summary: "Partly sunny, PM storms", temp_f: 97 },
      cost_range: "$0–$50",
      date: "2026-06-27",
      overview:
        "A relaxed Cary day built for families: a producer-only farmers' market in Morrisville, an afternoon at Downtown Cary Park, then the NC Symphony performing the music of Billy Joel under the stars at Koka Booth Amphitheatre.",
      schedule: {
        morning: [
          { time: "9:00 AM", title: "Western Wake Farmers' Market", event_id: id("Western Wake Farmers", "2026-06-27"), location: "101 Town Hall Dr, Morrisville", price: "Free", notes: "Local produce, baked goods, and prepared foods. Vegan and vegetarian stalls available." },
        ],
        afternoon: [
          { time: "3:00 PM", title: "Downtown Cary Park (self-guided)", location: "327 S Academy St, Cary", price: "Free", notes: "Splash fountains, shaded lawns, and the play areas — an easy midday break before the amphitheater." },
        ],
        evening: [
          { time: "8:00 PM", title: "The Music of Billy Joel with Tony DeSare (NC Symphony)", event_id: id("Billy Joel", "2026-06-27"), location: "Koka Booth Amphitheatre, 8003 Regency Pkwy", price: "$$", notes: "Bring a blanket and a picnic; lawn seating. Gates open ~90 min early." },
        ],
      },
      food: [
        { slot: "lunch", place: "Udipi Cafe (South Indian, all-vegetarian)", city: "Cary", vegan_dish: "Masala dosa with sambar & coconut chutney", vegetarian_dish: "Idli-vada combo", price: "$$", notes: "Fully vegetarian; many vegan options — ask for no ghee." },
        { slot: "dinner", place: "Picnic at Koka Booth", city: "Cary", vegan_dish: "Build-your-own hummus & veggie wrap", vegetarian_dish: "Caprese & pasta salad", price: "$", notes: "Koka Booth allows picnics/coolers for symphony shows — pack ahead, or buy from on-site vendors." },
      ],
      alternatives: [
        { leg: "Afternoon at Downtown Cary Park", good_weather: "Splash pad and lawn games", rain: "Shop and café-hop along Academy/Chatham St under cover" },
        { leg: "Evening symphony", good_weather: "Lawn picnic under the stars", rain: "Koka Booth covered pavilion seats stay dry; lawn folks should bring ponchos" },
      ],
      practical_notes: [
        "Confirm Koka Booth's picnic/cooler policy for this show before packing glass.",
        "Mosquitoes near the lake at dusk — bring repellent.",
        "Free parking at Koka Booth fills early on symphony nights.",
      ],
      event_ids: [id("Western Wake Farmers", "2026-06-27"), id("Billy Joel", "2026-06-27")],
    },
    {
      id: "sunday-markets-and-music",
      title: "Sunday Markets & Free Music, Durham to Chapel Hill",
      theme: "Lazy free-music Sunday across three towns",
      anchor_city: "Durham",
      drive_time: "Durham → Carrboro → Chapel Hill, ~20 min total hops",
      weather: { summary: "Mostly sunny, slight PM storms", temp_f: 96 },
      cost_range: "Free (pay only for food)",
      date: "2026-06-28",
      overview:
        "An almost-free Sunday strung together by live music: a vendor market at Durham Central Park, brunch music on the lawn at Weaver Street Market in Carrboro, an interactive public-art installation at the Ackland, and a sunset concert at Southern Village.",
      schedule: {
        morning: [
          { time: "11:00 AM", title: "Durham Underground Market", event_id: id("Durham Underground Market", "2026-06-28"), location: "Durham Central Park, 501 Foster St", price: "Free", notes: "50+ vendors, live musicians, and food trucks under the pavilion." },
        ],
        afternoon: [
          { time: "12:00 PM", title: "Sunday Brunch Music: Saludos Compay", event_id: id("Saludos Compay", "2026-06-28"), location: "Weaver Street Market, Carrboro", price: "Free", notes: "Grab a deli plate and a spot on the lawn — quintessential Carrboro." },
          { time: "2:00 PM", title: "pARC by The Urban Conga", event_id: id("pARC", "2026-06-28"), location: "Ackland Art Museum, Chapel Hill", price: "Free", notes: "Interactive outdoor art; pop inside the free Ackland galleries to cool off." },
        ],
        evening: [
          { time: "7:00 PM", title: "Sundays at Sundown: Capital Transit", event_id: id("Capital Transit", "2026-06-28"), location: "Southern Village green, Chapel Hill", price: "Free", notes: "Lawn concert; bring chairs and tip the band. Dinner on the village plaza first." },
        ],
      },
      food: [
        { slot: "lunch", place: "Weaver Street Market (vegan deli)", city: "Carrboro", vegan_dish: "Vegan mac & 'cheese' + tofu banh mi", vegetarian_dish: "Seasonal grain bowl", price: "$", notes: "Self-serve hot bar and deli right where the brunch music plays." },
        { slot: "dinner", place: "Town Hall Grill / Southern Village plaza", city: "Chapel Hill", vegan_dish: "Veggie burger (no cheese) with fries", vegetarian_dish: "Margherita flatbread", price: "$$", notes: "Several plaza spots steps from the concert green." },
      ],
      alternatives: [
        { leg: "Midday Ackland visit", good_weather: "Play on the outdoor pARC installation", rain: "Move into the free, air-conditioned Ackland galleries" },
        { leg: "Evening Southern Village concert", good_weather: "Lawn picnic at sundown", rain: "If storms roll in, the village's covered patios and shops keep you close until it clears" },
      ],
      practical_notes: [
        "This whole day can be done for the price of food + gas.",
        "Carrboro and Southern Village both have easy free parking on Sundays.",
        "Afternoon storm chance is slight but real — keep a small umbrella in the car.",
      ],
      event_ids: [id("Durham Underground Market", "2026-06-28"), id("Saludos Compay", "2026-06-28"), id("pARC", "2026-06-28"), id("Capital Transit", "2026-06-28")],
    },
    {
      id: "ballpark-and-butterflies",
      title: "Butterflies by Day, Bulls by Night",
      theme: "Family science museum + Triple-A fireworks night",
      anchor_city: "Durham",
      drive_time: "~10 min between museum and ballpark",
      weather: { summary: "Sunny", temp_f: 101 },
      cost_range: "$23–$60",
      date: "2026-07-02",
      overview:
        "A classic Durham family day: the Museum of Life and Science (Butterfly House, Dinosaur Trail, live animals) when it's hottest, then Triple-A baseball as the Durham Bulls host the Gwinnett Stripers on an Independence-week fireworks night at the historic DBAP.",
      schedule: {
        morning: [
          { time: "10:00 AM", title: "Museum of Life and Science", event_id: id("Museum of Life and Science", "2026-06-27"), location: "433 W Murray Ave, Durham", price: "$23 adult / $18 child", notes: "Indoor + shaded outdoor exhibits; the Butterfly House is a cool, humid escape. (Open daily through the week.)" },
        ],
        afternoon: [
          { time: "2:00 PM", title: "AC break / downtown Durham stroll", location: "American Tobacco Campus, Durham", price: "Free", notes: "It hits 101°F — retreat to the shaded ATC boardwalk and shops near the ballpark." },
        ],
        evening: [
          { time: "6:45 PM", title: "Durham Bulls vs. Gwinnett Stripers", event_id: id("Durham Bulls", "2026-07-02"), location: "Durham Bulls Athletic Park, 409 Blackwell St", price: "$$", notes: "Independence-week homestand with fireworks nights — arrive early for a good lawn/berm spot." },
        ],
      },
      food: [
        { slot: "lunch", place: "The Parlour + food trucks (museum area)", city: "Durham", vegan_dish: "Vegan coconut/sorbet scoops", vegetarian_dish: "Grilled cheese from rotating trucks", price: "$", notes: "Light lunch; save room for the ballpark." },
        { slot: "dinner", place: "Ballpark + Tobacco Road Sports Café", city: "Durham", vegan_dish: "Soft pretzel + veggie-loaded nachos (hold cheese)", vegetarian_dish: "Veggie burger at the café next door", price: "$$", notes: "DBAP has a few veg options; Tobacco Road Café overlooks the field." },
      ],
      alternatives: [
        { leg: "Daytime museum", good_weather: "Dinosaur Trail and outdoor habitats", rain: "Plenty of indoor exhibits keep the day going" },
        { leg: "Evening ballgame", good_weather: "Lawn berm seating for the fireworks", rain: "DBAP delays for storms — keep an eye on the forecast; covered concourse if a cell passes" },
      ],
      practical_notes: [
        "Hottest day of the window (101°F) — sunscreen, water, and midday shade are essential.",
        "DBAP fireworks nights sell out the berm; buy tickets ahead.",
        "Park in the ATC decks and walk to the gates.",
      ],
      event_ids: [id("Museum of Life and Science", "2026-06-27"), id("Durham Bulls", "2026-07-02")],
    },
    {
      id: "historic-raleigh-stroll",
      title: "Historic Raleigh: Trolley, Tours & a Pop Show",
      theme: "City history by day, big pop concert by night",
      anchor_city: "Raleigh",
      drive_time: "Downtown Raleigh + 12 min to Walnut Creek",
      weather: { summary: "Partly sunny, PM storms", temp_f: 97 },
      cost_range: "$17–$60",
      date: "2026-06-27",
      overview:
        "A history-buff's Raleigh Saturday: a guided tour of Mordecai Historic Park (birthplace of President Andrew Johnson), the hour-long Historic Raleigh trolley, treasure-hunting at the Raleigh Market, then Meghan Trainor's The Get In Girl Tour at Coastal Credit Union Music Park.",
      schedule: {
        morning: [
          { time: "10:00 AM", title: "Mordecai Historic Park Guided Tour", event_id: id("Mordecai Historic Park Guided Tour", "2026-06-27"), location: "1 Mimosa St, Raleigh", price: "$7 adult", notes: "Tours leave the Visitor Center on the hour, 10am–3pm." },
          { time: "11:00 AM", title: "Historic Raleigh Trolley Tour", event_id: id("Historic Raleigh Trolley", "2026-06-27"), location: "Departs Mordecai Historic Park", price: "$10 adult", notes: "One-hour narrated loop of historic downtown; departs 11, 12, 1, 2." },
        ],
        afternoon: [
          { time: "1:30 PM", title: "The Raleigh Market", event_id: id("Raleigh Market", "2026-06-27"), location: "NC State Fairgrounds, 4285 Trinity Rd", price: "Free", notes: "Antiques, crafts, and collectibles; free admission and parking. Indoor + outdoor — some AC relief." },
        ],
        evening: [
          { time: "6:30 PM", title: "Meghan Trainor: The Get In Girl Tour", event_id: id("Meghan Trainor", "2026-06-27"), location: "Coastal Credit Union Music Park at Walnut Creek", price: "$41+", notes: "Outdoor amphitheater ~12 min from downtown; with Icona Pop." },
        ],
      },
      food: [
        { slot: "lunch", place: "Capital Club 16 / Person Street", city: "Raleigh", vegan_dish: "Crispy chickpea bowl", vegetarian_dish: "Spaetzle with seasonal veg", price: "$$", notes: "Near Mordecai/Person St; lots of veg-friendly cafés in the Oakwood area." },
        { slot: "dinner", place: "Guasaca (Venezuelan arepas)", city: "Raleigh", vegan_dish: "Vegan arepa with black beans, avocado & plantain", vegetarian_dish: "Cheese arepa + yuca fries", price: "$", notes: "Fast and on the way to Walnut Creek; build-your-own with vegan options." },
      ],
      alternatives: [
        { leg: "Midday Raleigh Market", good_weather: "Browse the outdoor vendor rows", rain: "Head for the indoor buildings; the market runs rain or shine" },
        { leg: "Evening concert", good_weather: "Lawn seats at sunset", rain: "Walnut Creek lawn is exposed — bring a poncho; pavilion seats stay dry" },
      ],
      practical_notes: [
        "Buy the Mordecai tour + trolley combo at the Visitor Center; they sell out on nice Saturdays.",
        "Walnut Creek is clear-bag only; gates ~90 min before showtime.",
        "Afternoon storms are brief — they usually clear before the 6:30 gates.",
      ],
      event_ids: [id("Mordecai Historic Park Guided Tour", "2026-06-27"), id("Historic Raleigh Trolley", "2026-06-27"), id("Raleigh Market", "2026-06-27"), id("Meghan Trainor", "2026-06-27")],
    },
  ];

  const out: ItinerariesStore = {
    schema_version: 1,
    generated_at: NOW,
    week: WEEK,
    itineraries,
  };
  await writeFile(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`seed_itineraries: wrote ${itineraries.length} itineraries -> ${OUT}`);
}

main().catch((err) => {
  console.error("seed_itineraries failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
