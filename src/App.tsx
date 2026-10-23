import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AppWindow, ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronRight, Circle, Code2, Copy, Download, Laptop, Layers2, Monitor, Moon, Palette, Plus, Smartphone, Sun, X } from 'lucide-react';
import { Logo } from './components/Logo';
import { PlatformMockups, type Platform } from './components/PlatformMockups';
import { BranchGraphExample } from './components/BranchGraph';
import { Badge, Button, Field, Switch } from './components/ui';

type Section = 'platforms' | 'foundations' | 'components' | 'identity';
type Theme = 'light' | 'dark';
const sections: { id: Section; label: string; icon: typeof Monitor | typeof Logo }[] = [
  { id: 'platforms', label: 'Platform mockups', icon: Monitor },
  { id: 'foundations', label: 'Foundations', icon: Palette },
  { id: 'components', label: 'Components', icon: Layers2 },
  { id: 'identity', label: 'Identity & assets', icon: Logo },
];
const validSection = (value: string): Section => sections.some(s => s.id === value) ? value as Section : 'platforms';

const PLATFORM_DESCRIPTIONS: Record<Platform, string> = {
  mac: 'A desk for everyday notes and longer drafts.',
  windows: 'The same desk, with Windows chrome and shortcuts.',
  omarchy: 'At home in a keyboard-first, tiled workspace.',
  mobile: 'Phones and folding screens, with space for the words.',
};

const PLATFORM_CAPTIONS: Record<Platform, string> = {
  mac: 'Familiar window controls. A visible library. An uncluttered page.',
  windows: 'Caption buttons on the right, Mica tint, Ctrl K to search.',
  omarchy: 'Minimal chrome. Clear focus. The same portable notes.',
  mobile: 'Browse your library, open a note, then return without losing your place. Folded devices keep both on screen.',
};

export default function App() {
  const [section, setSection] = useState<Section>(() => validSection(location.hash.slice(1)));
  const [theme, setTheme] = useState<Theme>('light');
  const [platform, setPlatform] = useState<Platform>('mac');
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef<number | undefined>(undefined);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const onHash = () => setSection(validSection(location.hash.slice(1)));
    window.addEventListener('hashchange', onHash);
    return () => { window.removeEventListener('hashchange', onHash); window.clearTimeout(noticeTimer.current); };
  }, []);
  function notify(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 4500);
  }
  return <>
    <a href="#main" className="skip-link">Skip to content</a>
    <header className="site-header">
      <a href="#platforms" className="brand"><Logo size={36} /><span>NoteWren</span></a>
      <span className="header-divider" />
      <span className="header-title">Design system</span>
      <div className="header-actions"><span className="version-label">Working edition</span>
        <button className="theme-button" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
          {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}<span>{theme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </header>
    <div className="site-layout">
      <aside className="reference-nav">
        <div className="nav-heading">The system</div>
        <nav aria-label="Design system sections">{sections.map(({ id, label, icon: Icon }) => <a key={id} href={`#${id}`} aria-current={section === id ? 'page' : undefined}><Icon size={17} aria-hidden="true" /><span>{label}</span>{section === id && <ChevronRight size={13} className="nav-arrow" />}</a>)}</nav>
        <div className="nav-note"><div className="tiny-logo"><Logo size={25} /></div><p>A little room<br />to think.</p><span>Markdown notes.<br />Your own server.</span></div>
        <div className="nav-foot"><span className="status-dot" />Local design preview</div>
      </aside>
      <main id="main" className={`reference-main section-${section}`} tabIndex={-1}>
        {section === 'platforms' && <>
          <div className="page-heading"><div><h1>A familiar place to write.</h1><p>Four platforms. One considered set of working parts.</p></div><span className="reference-stamp"><Code2 size={15} />Interactive mockups</span></div>
          <div className="platform-controls"><div className="segmented" role="group" aria-label="Preview platform">
            {([{ id: 'mac', title: 'macOS', Icon: Laptop }, { id: 'windows', title: 'Windows', Icon: AppWindow }, { id: 'omarchy', title: 'Omarchy', Icon: Monitor }, { id: 'mobile', title: 'Mobile', Icon: Smartphone }] as const).map(({ id, title, Icon }) => <button key={id} aria-pressed={platform === id} onClick={() => setPlatform(id)}><Icon size={16} />{title}</button>)}
          </div><span className="platform-description">{PLATFORM_DESCRIPTIONS[platform]}</span></div>
          <div className={`platform-stage stage-${platform}`}><PlatformMockups key={platform} platform={platform} /></div>
          <div className="platform-caption"><p>{PLATFORM_CAPTIONS[platform]}</p><a href="#components">Explore the components<ArrowRight size={15} /></a></div>
          <div className="principle-strip"><div><span className="principle-mark"><Circle size={18} /></span><strong>Room to write</strong><p>Interface recedes. The words stay central.</p></div><div><span className="principle-mark"><Layers2 size={18} /></span><strong>Shared at the core</strong><p>Tokens and components travel across screens.</p></div><div><span className="principle-mark"><CheckCircle2 size={18} /></span><strong>State stays visible</strong><p>Offline, pending and conflict are distinct.</p></div></div>
        </>}
        {section === 'foundations' && <Foundations notify={notify} />}
        {section === 'components' && <Components notify={notify} />}
        {section === 'identity' && <Identity />}
        <footer className="site-footer"><span>NoteWren design system</span><span>Sample content · Native app and sync not connected</span></footer>
      </main>
    </div>
    <div className="toast-region" role="status" aria-live="polite">{notice && <div className="toast"><Check size={16} /><span>{notice}</span><button aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={15} /></button></div>}</div>
  </>;
}

function Heading({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{children}</p></div></div>;
}

function Foundations({ notify }: { notify: (message: string) => void }) {
  async function copy(value: string) {
    try { await navigator.clipboard.writeText(value); notify(`${value} copied`); }
    catch { notify(`Clipboard unavailable. Colour value: ${value}`); }
  }
  return <>
    <Heading title="Warmth, with a purpose.">A restrained palette, clear type and spacing that gives writing room.</Heading>
    <section className="reference-section"><div className="section-heading"><h2>Colour</h2><p>The identity colours stay fixed. Interface roles adapt to the theme.</p></div>
      <div className="palette-grid">{[
        ['Cream', '#F9F2E6', 'Primary identity ground'], ['Ink', '#171717', 'Wordmark and symbol'], ['Terracotta', '#D96545', 'Identity accent'], ['Moss', '#657A64', 'Secondary identity'], ['Slate blue', '#4F6D85', 'Secondary identity'],
      ].map(([name, hex, use]) => <button className="swatch" key={name} onClick={() => void copy(hex)} aria-label={`Copy ${name} colour ${hex}`}><span className="swatch-colour" style={{ background: hex }} /><span className="swatch-name">{name}<Copy size={13} /></span><code>{hex}</code><small>{use}</small></button>)}</div>
      <div className="semantic-palette">{[['Canvas', '--bg'], ['Surface', '--surface'], ['Text', '--fg'], ['Muted', '--muted'], ['Action', '--accent'], ['Success', '--success'], ['Warning', '--warning'], ['Error', '--error']].map(([name, token]) => <div key={token}><span style={{ background: `var(${token})` }} /><div>{name}<code>{token}</code></div></div>)}</div>
      <p className="design-note">Terracotta is a brand colour. The light-theme action colour is a deeper clay (#A64028) so white button text remains readable. Dark-theme actions use warm peach with dark text.</p>
    </section>
    <section className="reference-section"><div className="section-heading"><h2>Typography</h2><p>One voice for the interface. Another for the page.</p></div>
      <div className="type-specimen"><div className="ui-specimen"><span className="specimen-caption">Manrope · Interface</span><h3>Everyday notes,<br />open files.</h3><p>A clear, generous sans-serif for navigation, controls and the wordmark.</p><div className="type-weights"><span>Regular 400</span><b>Semibold 600</b><strong>Bold 800</strong></div></div>
      <div className="prose-specimen"><span className="specimen-caption">Source Serif 4 · Writing</span><h3>A little room to think.</h3><p>Some thoughts arrive fully formed. Most need a place to wait, to grow, to become something you can return to.</p><p>Start with a line. Leave room for the next one.</p></div></div>
      <div className="type-scale">{[['Display', '48 / 1.15', 'var(--text-display)'], ['Section', '28 / 1.3', 'var(--text-xl)'], ['Body', '16 / 1.6', 'var(--text-base)'], ['Label', '14 / 1.5', 'var(--text-sm)'], ['Caption', '12 / 1.5', 'var(--text-xs)']].map(([label, metrics, size]) => <div key={label}><span style={{ fontSize: size }}>{label}</span><code>{metrics}</code></div>)}</div>
    </section>
    <section className="reference-section"><div className="section-heading"><h2>Space & shape</h2><p>A 4px base. Compact controls. Generous separation between tasks.</p></div><div className="spacing-scale">{[4, 8, 12, 16, 24, 32, 48, 64].map(n => <div key={n}><span style={{ width: n, height: 32 }} /><code>{n}px</code></div>)}</div><div className="shape-examples">{[6, 10, 16].map(n => <div key={n} style={{ borderRadius: n }}><span>{n}px</span><small>{n === 6 ? 'Controls' : n === 10 ? 'Panels' : 'Windows'}</small></div>)}</div></section>
    <section className="reference-section usage-rules"><div><h2>Interaction rules</h2><p>Controls have a visible focus ring and at least a 44px touch target. Selection uses a warm tint. Status always includes words, not colour alone.</p></div><div><h2>Motion</h2><p>140ms for controls, 220ms for view changes. Ease out. Keep content visible and honour reduced motion. The writing page does not animate while you type.</p></div></section>
  </>;
}

function Components({ notify }: { notify: (message: string) => void }) {
  const [compact, setCompact] = useState(false);
  const [spellcheck, setSpellcheck] = useState(true);
  const [name, setName] = useState('Field notes');
  const [error, setError] = useState('');
  const [notebook, setNotebook] = useState('Field notes');
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { setError('Give your notebook a name.'); return; }
    if (name.trim().length > 48) { setError('Use 48 characters or fewer.'); return; }
    setError(''); setNotebook(name.trim()); notify(`Preview notebook renamed to ${name.trim()}`);
  }
  function previewLoading() {
    setLoading(true);
    timer.current = window.setTimeout(() => { setLoading(false); notify('Loading state preview finished. No request was sent.'); }, 1200);
  }
  return <>
    <Heading title="Small parts. Thought through.">Reusable controls, useful feedback and the states between.</Heading>
    <section className="reference-section"><div className="section-heading"><h2>Branches</h2><p>Try another direction without changing the draft you started from. Inspect a branch, compare it with its fork point, then choose where to continue writing.</p></div><BranchGraphExample /><p className="design-note">Branching only. There is no merge action. This example keeps changes in memory and resets when you leave this section or reload.</p></section>
    <section className="reference-section"><div className="section-heading"><h2>Actions</h2><p>One primary action per task. Verb-led labels. Icons support the words.</p></div><div className="button-gallery"><div><Button icon={<Plus size={16} />} onClick={() => notify('Primary action activated')}>New note</Button><code>primary</code></div><div><Button variant="secondary" onClick={() => notify('Secondary action activated')}>Open notebook</Button><code>secondary</code></div><div><Button variant="ghost" onClick={() => notify('Ghost action activated')}>Cancel</Button><code>ghost</code></div><div><Button variant="danger" onClick={() => { setEmpty(true); notify('Preview notes cleared. Use Add a note to restore the example.'); }}>Clear preview</Button><code>danger</code></div><div><Button disabled>Unavailable</Button><code>disabled</code></div><div><Button loading={loading} onClick={previewLoading}>{loading ? 'Loading preview' : 'Preview loading'}</Button><code>simulated delay</code></div></div></section>
    <div className="component-columns"><section className="reference-section"><div className="section-heading"><h2>Fields & validation</h2><p>Errors explain the next step.</p></div><form onSubmit={submit} className="example-form" noValidate><Field label="Notebook name" value={name} onChange={e => setName(e.target.value)} hint="Up to 48 characters. Stored for this preview only." error={error} /><Button type="submit" variant="secondary">Rename notebook</Button></form><p className="preview-result">Current notebook <strong>{notebook}</strong></p></section>
    <section className="reference-section"><div className="section-heading"><h2>Preferences</h2><p>Immediate and reversible.</p></div><Switch label="Compact note list" checked={compact} onChange={setCompact} description="Fit more notes in the library." /><Switch label="Check spelling" checked={spellcheck} onChange={setSpellcheck} description="Browser spelling hints in the field below." /><textarea className="spelling-preview" aria-label="Spelling preview" spellCheck={spellcheck} defaultValue="A small thought for another day." /><div className={`density-preview ${compact ? 'is-compact' : ''}`}>{['Along the coastal path', 'A little room to think', 'Notes for a slower week'].map(title => <div key={title}><span>{title}</span><small>Markdown</small></div>)}</div></section></div>
    <section className="reference-section"><div className="section-heading"><h2>Document states</h2><p>Visual examples. These are not connected to a sync service.</p></div><div className="state-list"><div><Badge>Offline</Badge><p>Edits stay on this device until it reconnects.</p></div><div><Badge tone="warning">Pending changes</Badge><p>The note is waiting to be sent.</p></div><div><Badge tone="error">Conflict</Badge><p>Both versions are kept. Choose what to keep next.</p></div><div><Badge tone="success">Up to date</Badge><p>The server has acknowledged the latest revision.</p></div></div></section>
    <section className="reference-section"><div className="section-heading"><h2>An empty notebook</h2><p>Explain the state, then offer a useful action.</p></div><div className="empty-example">{empty ? <><Logo size={62} /><h3>Something starts here.</h3><p>A line, a list, an idea to come back to.<br />Your notebook is ready when you are.</p><Button icon={<Plus size={16} />} onClick={() => setEmpty(false)}>Add a note</Button></> : <div className="restored-note"><Badge tone="success">Created in preview</Badge><h3>Your first thought</h3><p>This example note exists for this session.</p><Button variant="secondary" onClick={() => setEmpty(true)}>Reset empty state</Button></div>}</div></section>
  </>;
}

function Identity() {
  const [variant, setVariant] = useState<'negative' | 'filled'>('negative');
  return <>
    <Heading title="A little bird. A clear identity.">One master silhouette, real transparent cutouts and assets you can use.</Heading>
    <section className="identity-hero"><Logo size={144} variant={variant} /><div><span className="identity-wordmark">NoteWren</span><p>Everyday notes, open files.</p></div></section>
    <div className="identity-toolbar"><div className="segmented" role="group" aria-label="Logo variant"><button aria-pressed={variant === 'negative'} onClick={() => setVariant('negative')}>Wing cutout</button><button aria-pressed={variant === 'filled'} onClick={() => setVariant('filled')}>Solid silhouette</button></div><span>Wing and eye reveal the surface underneath.</span></div>
    <section className="reference-section"><div className="section-heading"><h2>Colour & contrast</h2><p>Primary cream-and-black. Terracotta, moss and blue for alternate app tiles.</p></div><div className="logo-tiles">{[['Cream', '#F9F2E6', '#171717'], ['Terracotta', '#D96545', '#FFFFFF'], ['Moss', '#657A64', '#FFFFFF'], ['Slate blue', '#4F6D85', '#FFFFFF'], ['Ink', '#171717', '#FFFFFF']].map(([name, bg, fg]) => <div key={name}><div className="logo-tile" style={{ background: bg, color: fg }}><Logo size={91} variant={variant} /></div><span>{name}</span></div>)}</div>
    <div className="transparency-demo"><div className="checkerboard"><Logo size={88} variant={variant} /></div><p><strong>True negative space.</strong><br />The checked background is visible through the eye{variant === 'negative' ? ' and wing' : ''}. There is no white shape painted on top.</p></div></section>
    <section className="reference-section"><div className="section-heading"><h2>Actual sizes</h2><p>Use the filled mark for compact placements. Keep the symbol at least 16px high.</p></div><div className="logo-sizes">{[128, 64, 32, 24, 16].map(size => <div key={size}><Logo size={size} variant={size < 32 ? 'filled' : variant} /><code>{size}px</code></div>)}</div></section>
    <section className="reference-section"><div className="section-heading"><h2>Download the assets</h2><p>Individual SVG files. Scalable, transparent and editable.</p></div><div className="asset-downloads">{[
      ['negative', 'Wing cutout', 'black'], ['negative-white', 'Wing cutout', 'white'], ['negative-colour', 'Wing cutout', 'terracotta'], ['filled', 'Solid silhouette', 'black'], ['filled-white', 'Solid silhouette', 'white'], ['filled-colour', 'Solid silhouette', 'terracotta'],
    ].map(([file, title, colour]) => <a key={file} href={`/brand/notewren-${file}.svg`} download><span className={`asset-preview ${colour === 'white' ? 'on-ink' : ''}`} style={{ color: colour === 'terracotta' ? '#d96545' : colour === 'white' ? '#ffffff' : '#171717' }}><Logo size={32} variant={file.startsWith('filled') ? 'filled' : 'negative'} /></span><span><strong>{title}</strong><small>{colour} · SVG</small></span><ArrowDownToLine size={17} /></a>)}</div><div className="app-icon-downloads"><a href="/brand/app-icon-cream.svg" download><img src="/brand/app-icon-cream.svg" width="48" height="48" alt="Cream NoteWren app icon" />Cream app icon<Download size={16} /></a><a href="/brand/app-icon-terracotta.svg" download><img src="/brand/app-icon-terracotta.svg" width="48" height="48" alt="Terracotta NoteWren app icon" />Terracotta app icon<Download size={16} /></a></div></section>
    <section className="reference-section usage-rules"><div><h2>Keep it consistent</h2><p>Do not stretch, rotate or redraw the bird. Leave clear space of at least one fifth of the mark’s height on each side. Use the bold sans-serif wordmark.</p></div><div><h2>Keep it readable</h2><p>Use one colour for the symbol. Avoid gradients and detailed backgrounds. At small sizes the silhouette matters more than the eye.</p></div></section>
  </>;
}
