import { useEffect, useState } from "react";
import { loadData, type LoadedData } from "./data/loadData";
import Tabs, { type TabKey } from "./components/Tabs";
import EventsExplorer from "./components/EventsExplorer";
import ItineraryView from "./components/ItineraryView";

const ICS_URL = `${import.meta.env.BASE_URL}events.ics`;

function formatGenerated(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function App() {
  const [data, setData] = useState<LoadedData | null>(null);
  const [tab, setTab] = useState<TabKey>("events");

  useEffect(() => {
    loadData().then(setData);
  }, []);

  return (
    <div className="app">
      <header className="site-header">
        <div className="container">
          <div className="head-row">
            <div>
              <div className="wordmark">
                <span className="mark" aria-hidden>
                  △
                </span>
                Triangle Weekend
              </div>
              <p className="tagline">
                Everything worth doing this week across Raleigh, Durham, Chapel Hill &amp; Cary — refreshed weekly,
                with maps, itineraries, and a calendar you can subscribe to.
              </p>
            </div>
            <div className="head-aside">
              {data && !data.isSample && data.generatedAt && (
                <span className="head-stamp">Updated {formatGenerated(data.generatedAt)} ET</span>
              )}
              {data?.isSample && <span className="head-stamp">Sample data · pipeline pending</span>}
              <a className="subscribe-pill" href={ICS_URL}>
                📅 Subscribe
              </a>
            </div>
          </div>
          <Tabs active={tab} onChange={setTab} />
        </div>
      </header>

      {!data ? (
        <div className="container">
          <div className="empty">
            <h3>Loading this week's events…</h3>
          </div>
        </div>
      ) : tab === "events" ? (
        <EventsExplorer events={data.events} origin={data.origin} />
      ) : (
        <ItineraryView itineraries={data.itineraries} events={data.events} />
      )}

      <footer className="site-footer">
        <div className="container">
          Triangle Weekend Events · day-trip ideas within the Raleigh / Triangle metro ·{" "}
          <a href={ICS_URL}>events.ics</a>
          {data?.isSample && " · sample data shown"}
        </div>
      </footer>
    </div>
  );
}
