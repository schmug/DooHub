import type { CSSProperties } from "react";
import {
  formatMinutes,
  TIME_MAX,
  TIME_MIN,
  TIME_PRESETS,
  TIME_STEP,
  type TimeRange,
} from "../lib/timeRange";

interface Props {
  range: TimeRange;
  includeAllDay: boolean;
  onChange: (range: TimeRange, includeAllDay: boolean) => void;
}

const pct = (m: number) => ((m - TIME_MIN) / (TIME_MAX - TIME_MIN)) * 100;

/**
 * Dual-handle start-time range: two stacked native range inputs sharing one
 * track, so no slider library is needed. The handles can't cross; they stay at
 * least one step apart.
 */
export default function TimeSlider({ range, includeAllDay, onChange }: Props) {
  const [lo, hi] = range;
  const setLo = (v: number) => onChange([Math.min(v, hi - TIME_STEP), hi], includeAllDay);
  const setHi = (v: number) => onChange([lo, Math.max(v, lo + TIME_STEP)], includeAllDay);

  return (
    <div className="time-slider">
      <div className="time-slider-readout" aria-live="polite">
        {lo <= TIME_MIN && hi >= TIME_MAX ? "Any time" : `${formatMinutes(lo)} – ${formatMinutes(hi)}`}
      </div>
      <div
        className="time-slider-track"
        style={{ "--lo": `${pct(lo)}%`, "--hi": `${pct(hi)}%` } as CSSProperties}
      >
        <input
          type="range"
          min={TIME_MIN}
          max={TIME_MAX}
          step={TIME_STEP}
          value={lo}
          onChange={(e) => setLo(Number(e.target.value))}
          aria-label="Earliest start time"
          aria-valuetext={formatMinutes(lo)}
        />
        <input
          type="range"
          min={TIME_MIN}
          max={TIME_MAX}
          step={TIME_STEP}
          value={hi}
          onChange={(e) => setHi(Number(e.target.value))}
          aria-label="Latest start time"
          aria-valuetext={formatMinutes(hi)}
        />
      </div>
      <div className="chips">
        {TIME_PRESETS.map((p) => (
          <button
            key={p.label}
            className="chip"
            aria-pressed={lo === p.range[0] && hi === p.range[1]}
            onClick={() => onChange(p.range, includeAllDay)}
          >
            {p.label}
          </button>
        ))}
        <label className="time-slider-tbd">
          <input
            type="checkbox"
            checked={includeAllDay}
            onChange={(e) => onChange(range, e.target.checked)}
          />
          Include all-day / time TBD
        </label>
      </div>
    </div>
  );
}
