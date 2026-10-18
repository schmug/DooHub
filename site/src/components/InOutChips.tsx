import { cycleInOut, inOutState, type InOut } from "../lib/inOut";

export interface InOutOption {
  value: string;
  label: string;
  count?: number;
}

interface Props {
  options: InOutOption[];
  value: InOut;
  onChange: (next: InOut) => void;
}

const STATE_TEXT = { neutral: "not filtered", include: "included", exclude: "excluded" } as const;
const MARK = { neutral: "", include: "+ ", exclude: "− " } as const;

/**
 * Tri-state chips: each tap cycles neutral → include → exclude → neutral.
 * Shared by the category and city filters.
 */
export default function InOutChips({ options, value, onChange }: Props) {
  return (
    <>
      {options.map((o) => {
        const state = inOutState(value, o.value);
        return (
          <button
            key={o.value}
            type="button"
            className="chip chip-inout"
            data-state={state}
            aria-label={`${o.label}: ${STATE_TEXT[state]}`}
            title="Tap to include, again to exclude, again to clear"
            onClick={() => onChange(cycleInOut(value, o.value))}
          >
            <span aria-hidden="true">{MARK[state]}</span>
            {o.label}
            {o.count !== undefined && <span className="chip-count">{o.count}</span>}
          </button>
        );
      })}
    </>
  );
}
