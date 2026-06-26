export type TabKey = "events" | "itineraries";

interface Props {
  active: TabKey;
  onChange: (t: TabKey) => void;
}

export default function Tabs({ active, onChange }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label="Views">
      <button role="tab" aria-selected={active === "events"} onClick={() => onChange("events")}>
        This Week's Events
      </button>
      <button role="tab" aria-selected={active === "itineraries"} onClick={() => onChange("itineraries")}>
        Itineraries
      </button>
    </div>
  );
}
