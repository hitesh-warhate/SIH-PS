// Dark-green banner at the top of a staff, doctor or admin page: a title, a line of explanation and a row of figures.
// Figures are always real counts from the screen's own data (never decoration). `tone: 'alert'` marks a count that needs someone now.
const ICONS = {
  people: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9c0-4 3.6-6 8-6s8 2 8 6z',
  alert: 'M12 3l10 18H2zm-1 7v5h2v-5zm0 7v2h2v-2z',
  check: 'M12 3a9 9 0 100 18 9 9 0 000-18zm-1.5 13L6 11.5l1.4-1.4 3.1 3.1 6.1-6.1L18 8.5z',
  clock: 'M12 3a9 9 0 100 18 9 9 0 000-18zm1 4h-2v6l5 3 1-1.7-4-2.3z',
  file: 'M6 2h8l6 6v14H6zm7 1.5V9h5.5zM8 13h8v2H8zm0 4h8v2H8z',
  bolt: 'M13 2L4 14h6l-1 8 9-12h-6z',
};

export function GlyphIcon({ name, size = 20 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={ICONS[name] ?? ICONS.people} fill="currentColor" /></svg>;
}

export function Hero({ title, subtitle, tiles = [] }) {
  return (
    <section className="hero" aria-label={title}>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {tiles.length > 0 && (
        <div className="hero-tiles">
          {tiles.map((x) => (
            <div key={x.label} className={`hero-tile${x.tone === 'alert' && x.value > 0 ? ' is-alert' : ''}`}>
              <span className="label"><GlyphIcon name={x.icon} />{x.label.charAt(0).toUpperCase() + x.label.slice(1)}</span>
              <span className="n">{x.value ?? '–'}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
