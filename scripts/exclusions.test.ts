import { test } from "node:test";
import assert from "node:assert/strict";
import { excludedTopic } from "./lib/exclusions.js";

// Real titles from the 2026-W43 store.
const DATING = [
  "Raleigh Speed Dating (24-32 age group)",
  "**MEN SOLD OUT**SpeedRaleigh Dating | Ages 25–39 | Raleigh's Speed Dating",
  "Relish | Ages 32–44 | Raleigh’s Elevated Dating Experience",
  "Tantra Speed Date® - Raleigh! (Meet Singles Speed Dating)",
  "Beer Pong Speed Dating",
  "Boos & Booze Singles Night",
  "Find Your Boo 👻 Singles Mixer 💘",
  "50 plus Singles eating at Miltons",
  "Sapphic Singles After Dark",
  "Raleigh Singles - Make New Friends (24-32 group)",
];

const KEEP = [
  "TTE SATURDAY MORNING SINGLES OR DOUBLES at Robert Godbold Park, Cary, NC",
  "Pickleball Mixer + Donuts 🏓🍩",
  "Aro-Ace Mixer",
  "B2B Mixer Raleigh - 100% networking event - making referrals",
  "NC Catalina Wine Mixer at The Exchange Raleigh",
  "Salsa Wednesdays at Komana Brewery",
  "An Evening with Kathy Mattea",
];

test("dating titles are excluded", () => {
  for (const name of DATING) assert.equal(excludedTopic({ name }), "dating", name);
});

test("mixers, sports singles and music aren't dating", () => {
  for (const name of KEEP) assert.equal(excludedTopic({ name }), null, name);
});

test("description catches a dating event with a neutral title", () => {
  assert.equal(
    excludedTopic({
      name: "Pitch a Friend",
      description: "Whether you’re pitching a friend or just here to mingle, this event is all about meeting amazing singles.",
    }),
    "dating",
  );
  assert.equal(
    excludedTopic({ name: "Raleigh Connections", description: "CONNECTIONS: Sunday Social for Singles Ages 45–65" }),
    "dating",
  );
});

test("'singles' in a non-dating description is fine", () => {
  assert.equal(
    excludedTopic({ name: "Disc (Frisbee) Golf", description: "Or you can play singles and compete." }),
    null,
  );
  assert.equal(
    excludedTopic({ name: "An Evening with Kathy Mattea", description: "Her hit singles include..." }),
    null,
  );
});

test("outings posted by a singles Meetup group are excluded", () => {
  assert.equal(
    excludedTopic({ name: "Karaoke Night", info_url: "https://www.meetup.com/raleigh-fun-singles/events/316905186/" }),
    "dating",
  );
  assert.equal(
    excludedTopic({ name: "Karaoke Night", info_url: "https://www.meetup.com/triangle-karaoke/events/1/" }),
    null,
  );
});
