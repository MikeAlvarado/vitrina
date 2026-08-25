/* Page primitives. Nothing here knows about the library. */

import type { ReactNode } from 'react';

export function Section({
  id,
  index,
  kicker,
  title,
  lede,
  children,
}: {
  id: string;
  index: string;
  kicker: string;
  title: string;
  lede?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="section" id={id} aria-labelledby={`${id}-title`}>
      <div className="wrap section-head">
        <p className="eyebrow">
          {index} — {kicker}
        </p>
        <div>
          <h2 className="section-title" id={`${id}-title`}>
            {title}
          </h2>
          {lede ? <p className="lede">{lede}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}

export function Code({ label, note, children }: { label?: string; note?: string; children: ReactNode }) {
  return (
    <>
      {label ? (
        <p className="code-label">
          <span>{label}</span>
          {note ? <span>{note}</span> : null}
        </p>
      ) : null}
      <pre className="code">
        <code>{children}</code>
      </pre>
    </>
  );
}

export function Pill<T extends string>({
  value,
  current,
  onSelect,
  children,
}: {
  value: T;
  current: T;
  onSelect: (value: T) => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      className="pill"
      aria-pressed={current === value}
      onClick={() => onSelect(value)}
    >
      {children ?? value}
    </button>
  );
}

/**
 * One row of the config panel: the prop's name, what it does, the control, and
 * the value the plane is running on. A row is a prop — the panel never invents
 * a concept the library does not have.
 *
 * With `htmlFor` the name is a real <label> for a single input; without it the
 * field is a group of buttons and the name labels the group instead. Both
 * shapes are named; neither leans on the visual proximity alone.
 */
export function Control({
  htmlFor,
  name,
  note,
  value,
  children,
}: {
  htmlFor?: string;
  name: string;
  note: string;
  value: string;
  children: ReactNode;
}) {
  const nameId = `name-${name.replace(/\W+/g, '-')}`;
  const label = (
    <>
      {name}
      <span className="control-note">{note}</span>
    </>
  );
  return (
    <div className="control">
      {htmlFor ? (
        <label className="control-name" id={nameId} htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className="control-name" id={nameId}>
          {label}
        </span>
      )}
      {htmlFor ? (
        <div className="control-field">{children}</div>
      ) : (
        <div className="control-field" role="group" aria-labelledby={nameId}>
          {children}
        </div>
      )}
      <span className="control-value">{value}</span>
    </div>
  );
}

export function Slider({
  id,
  min,
  max,
  step,
  value,
  onChange,
}: {
  id: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      id={id}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

/** The bar that says where a change landed, and takes you there. */
export function AppliesToPlane({ summary }: { summary: string }) {
  return (
    <p className="applies">
      <span>Applied live to the plane at the top of the page — {summary}</span>
      <a href="#plane">↑ Go to the plane</a>
    </p>
  );
}
