import { useState } from 'react';

// Small charts drawn with SVG and CSS, no chart library. Each takes real numbers from the dashboard endpoint and shows the exact value on
// hover or focus, and the same value as text for screen readers, so nothing is conveyed by shape or colour alone.

// Bars for the last few days; the last bar (today) is highlighted.
export function MiniBars({ series, labels, unit = '', height = 64 }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series);
  const w = 100 / series.length;
  return (
    <div className="minibars" style={{ height }}>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={labels.map((l, i) => `${l}: ${series[i]}`).join(', ')}>
        {series.map((v, i) => {
          const h = Math.max(v > 0 ? 4 : 2, (v / max) * (height - 6));
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}>
              <rect x={i * w + w * 0.18} y={height - h} width={w * 0.64} height={h} rx="1.6" className={`bar${i === series.length - 1 ? ' is-today' : ''}${v === 0 ? ' is-zero' : ''}${hover === i ? ' is-hover' : ''}`} />
              <rect x={i * w} y="0" width={w} height={height} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hover != null && <span className="chart-tip">{labels[hover]}: <strong>{series[hover]}</strong>{unit}</span>}
    </div>
  );
}

const PALETTE = ['#8cc63f', '#2f6a0c', '#f08a24', '#3b82c4', '#7c5cc4', '#c94f7c', '#9aa59a'];

// A ring chart of shares, with a legend. Hovering a slice or a legend row highlights it.
export function Donut({ items, total, centerLabel, getLabel, size = 168, empty }) {
  const [hover, setHover] = useState(null);
  if (!total) return <p className="muted chart-empty">{empty}</p>;
  const r = 15.9155; // circumference 100, so a slice's length is its percentage
  let offset = 25;   // start at the top
  const slices = items.map((it, i) => {
    const share = (it.count / total) * 100;
    const s = { it, i, share, offset };
    offset -= share;
    return s;
  });
  return (
    <div className="donut">
      <div className="donut-ring" style={{ width: size, height: size }}>
        <svg viewBox="0 0 42 42" role="img" aria-label={items.map((x) => `${getLabel(x)}: ${x.percent}%`).join(', ')}>
          <circle cx="21" cy="21" r={r} className="ring-bg" />
          {slices.map(({ it, i, share, offset: o }) => (
            <circle key={it.key} cx="21" cy="21" r={r} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={hover === i ? 5.2 : 4.2}
              strokeDasharray={`${Math.max(share - 0.6, 0.2)} ${100 - Math.max(share - 0.6, 0.2)}`} strokeDashoffset={o} className="slice"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          ))}
        </svg>
        <div className="donut-center"><strong>{hover != null ? items[hover].count : total}</strong><span>{hover != null ? getLabel(items[hover]) : centerLabel}</span></div>
      </div>
      <ul className="legend">
        {items.map((it, i) => (
          <li key={it.key} className={hover === i ? 'is-hover' : ''} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <span className="dot" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" />
            <span className="lbl">{getLabel(it)}</span>
            <strong>{it.percent}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

const HOURS_DEFAULT = [8, 18];

// Monday to Saturday by hour, with a block for each patient at the time they arrived. Crowded hours show the first few and "+n".
export function WeekGrid({ schedule, dayLabel, hourLabel, moreLabel, statusLabel, onOpen, now = new Date() }) {
  const hours = schedule.items.map((i) => i.hour);
  // the rows start at the first hour anyone arrived (or the usual OPD morning when nobody has) and cover at least seven hours
  const from = hours.length ? Math.min(...hours) : HOURS_DEFAULT[0], to = Math.max(hours.length ? Math.max(...hours) : HOURS_DEFAULT[1], from + 6);
  const rows = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const nowHour = Number(now.toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }));
  const cell = (d, h) => schedule.items.filter((i) => i.date === d && i.hour === h);
  return (
    <div className="weekgrid" role="table" aria-label="week">
      <div className="wk-head" role="row">
        <span role="columnheader" />
        {schedule.days.map((d) => <span key={d} role="columnheader" className={d === schedule.today ? 'is-today' : ''}>{dayLabel(d)}</span>)}
      </div>
      <div className="wk-body">
        {rows.map((h) => (
          <div key={h} className={`wk-row${h === nowHour ? ' is-now' : ''}`} role="row">
            <span className="wk-hour" role="rowheader">{hourLabel(h)}</span>
            {schedule.days.map((d) => {
              const here = cell(d, h);
              return (
                <div key={d} className={`wk-cell${d === schedule.today ? ' is-today' : ''}`} role="cell">
                  {here.slice(0, 2).map((i) => (
                    <button key={i.id} type="button" className={`wk-block st-${i.status}`} title={`${i.name} · ${statusLabel(i.status)}`} onClick={() => onOpen?.(i)}>
                      {i.token != null && <b>#{i.token}</b>} {i.name.split(' ')[0]}
                    </button>
                  ))}
                  {here.length > 2 && <span className="wk-more">{moreLabel(here.length - 2)}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
