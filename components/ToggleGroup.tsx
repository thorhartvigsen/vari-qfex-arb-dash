"use client";

interface ToggleGroupProps<T extends string> {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}

export default function ToggleGroup<T extends string>({
  options,
  labels,
  value,
  onChange,
}: ToggleGroupProps<T>) {
  return (
    <div
      className="flex flex-wrap gap-1 rounded-md p-1"
      style={{
        border: "1px solid var(--arb-border)",
        backgroundColor: "var(--arb-panel)",
      }}
    >
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className="rounded px-3 py-1.5 text-sm font-medium transition"
            style={{
              backgroundColor: active ? "var(--arb-light)" : "transparent",
              color: active ? "var(--arb-btn-fg)" : "var(--arb-text)",
            }}
          >
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
