import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import { deleteEntry, getEntries, saveEntry, type Attachment, type JournalEntry } from './db'

type Draft = Pick<JournalEntry, 'date' | 'title' | 'location' | 'body' | 'attachments'>

const entryCode = '1313'
const maxImageSize = 2 * 1024 * 1024
const today = () => new Date().toISOString().slice(0, 10)
const makeDraft = (): Draft => ({ date: today(), title: '', location: '', body: '', attachments: [] })
const makeId = () => crypto.randomUUID()

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(`${value}T12:00:00`))
}

function Photo({ attachment, className = '' }: { attachment: Attachment; className?: string }) {
  const [source, setSource] = useState('')

  useEffect(() => {
    const url = URL.createObjectURL(attachment.blob)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [attachment.blob])

  return source
    ? <img className={className} src={source} alt={attachment.name} />
    : <span className={`${className} photo-placeholder`} aria-label="Loading image" />
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [search, setSearch] = useState('')
  const [isComposerOpen, setComposerOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(makeDraft)
  const [enteredCode, setEnteredCode] = useState('')
  const [imageWarning, setImageWarning] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshEntries() {
    setEntries(await getEntries())
  }

  useEffect(() => {
    refreshEntries().catch(() => setError('The journal could not open its local archive.'))
  }, [])

  const visibleEntries = entries.filter((entry) => {
    const query = search.trim().toLocaleLowerCase()
    return !query || [entry.title, entry.location, entry.body].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const journeyDays = new Set(entries.map((entry) => entry.date)).size
  const photoCount = entries.reduce((total, entry) => total + entry.attachments.length, 0)

  function startNewEntry() {
    setEditingId(null)
    setDraft(makeDraft())
    setEnteredCode('')
    setImageWarning('')
    setComposerOpen(true)
  }

  function startEditing(entry: JournalEntry) {
    setEditingId(entry.id)
    setEnteredCode('')
    setImageWarning('')
    setDraft({
      date: entry.date,
      title: entry.title,
      location: entry.location,
      body: entry.body,
      attachments: [...entry.attachments],
    })
    setComposerOpen(true)
  }

  function closeComposer() {
    setComposerOpen(false)
    setEditingId(null)
    setDraft(makeDraft())
    setEnteredCode('')
    setImageWarning('')
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingId && enteredCode !== entryCode) {
      setError('Enter the correct entry code before posting.')
      return
    }

    const existing = entries.find((entry) => entry.id === editingId)
    const timestamp = Date.now()
    const entry: JournalEntry = {
      ...draft,
      id: editingId ?? makeId(),
      title: draft.title.trim(),
      location: draft.location.trim(),
      body: draft.body.trim(),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    }

    try {
      await saveEntry(entry)
      await refreshEntries()
      closeComposer()
      setMessage(editingId ? 'Entry updated' : 'Entry added to the chronicle')
      window.setTimeout(() => setMessage(''), 2600)
      setError('')
    } catch {
      setError('Your entry could not be saved. Check browser storage and try again.')
    }
  }

  async function removeEntry(entry: JournalEntry) {
    if (!window.confirm(`Remove “${entry.title}” from your chronicle?`)) return
    try {
      await deleteEntry(entry.id)
      await refreshEntries()
      setMessage('Entry removed')
      window.setTimeout(() => setMessage(''), 2600)
    } catch {
      setError('This entry could not be removed.')
    }
  }

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const selectedImages = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    const files = selectedImages.filter((file) => file.size <= maxImageSize)
    const oversizedCount = selectedImages.length - files.length
    setImageWarning(oversizedCount > 0
      ? `${oversizedCount} image${oversizedCount === 1 ? '' : 's'} exceeded 2 MB and ${oversizedCount === 1 ? 'was' : 'were'} not attached.`
      : '')
    setDraft((current) => ({
      ...current,
      attachments: [...current.attachments, ...files.map((file) => ({
        id: makeId(), name: file.name, type: file.type, blob: file,
      }))],
    }))
    event.target.value = ''
  }

  function removeImage(id: string) {
    setDraft((current) => ({ ...current, attachments: current.attachments.filter((image) => image.id !== id) }))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Stone and Story home">
          <span className="brand-mark" aria-hidden="true"><i /><b /></span>
          <span className="brand-copy"><strong>STONE <em>&</em> STORY</strong><small>THE MOUNTAIN'S CHRONICLES</small></span>
        </a>
        <div className="topbar-right">
          <span className="realm-label"><span className="status-dot" /> PERSONAL ARCHIVE</span>
          <button className="button button-copper top-new" onClick={startNewEntry}><span aria-hidden="true">+</span> New entry</button>
        </div>
      </header>

      <div className="page-frame" id="top">
        <aside className="sidebar">
          <div className="sidebar-heading">YOUR CHRONICLE</div>
          <div className="nav-item nav-item-active"><span className="nav-icon">✦</span><span>Journey log</span><span className="nav-count">{entries.length}</span></div>
          <div className="sidebar-rule" />
          <div className="sidebar-heading">THE ROAD SO FAR</div>
          <div className="stat-line"><span>Days recorded</span><strong>{journeyDays}</strong></div>
          <div className="stat-line"><span>Memories kept</span><strong>{photoCount}</strong></div>
          <div className="sidebar-note">
            <span className="note-rune">ᛟ</span>
            <p>Stone remembers what the road forgets.</p>
            <small>— Khaz Modan saying</small>
          </div>
          <div className="sidebar-foot"><span className="mini-pick" /> MADE FOR THE LONG ROAD</div>
        </aside>

        <main className="main-content">
          <section className="page-intro">
            <div className="eyebrow"><span /> A DWARF'S TALE, ONE STEP AT A TIME</div>
            <div className="intro-row">
              <div><h1>The Long Way Across <i>Azeroth</i></h1><p>Every road leaves a story. Keep yours here.</p></div>
              <button className="button button-copper intro-new" onClick={startNewEntry}><span aria-hidden="true">+</span> Write an entry</button>
            </div>
          </section>

          <section className="archive-bar" aria-label="Journal summary">
            <div className="archive-label"><span className="archive-glyph">⌖</span><div><strong>ADVENTURE ARCHIVE</strong><small>{entries.length === 1 ? '1 entry inscribed' : `${entries.length} entries inscribed`}</small></div></div>
            <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the archive" aria-label="Search entries" /><kbd>/</kbd></label>
          </section>

          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {message && <div className="notice notice-success" role="status">{message}</div>}

          {visibleEntries.length > 0 ? (
            <div className="entries-list">
              {visibleEntries.map((entry, index) => (
                <article className="entry" key={entry.id}>
                  <div className="entry-rail"><span className="rail-dot" /><span className="rail-line" /></div>
                  <div className="entry-card">
                    <div className="entry-meta"><time dateTime={entry.date}>{formatDate(entry.date)}</time><span className="entry-separator">·</span><span className="location"><span aria-hidden="true">⌖</span> {entry.location || 'Somewhere in Azeroth'}</span><div className="entry-actions"><button aria-label={`Edit ${entry.title}`} title="Edit entry" onClick={() => startEditing(entry)}>✎</button><button aria-label={`Delete ${entry.title}`} title="Delete entry" onClick={() => removeEntry(entry)}>×</button></div></div>
                    <h2>{entry.title}</h2>
                    <p className="entry-body">{entry.body}</p>
                    {entry.attachments.length > 0 && <div className="entry-photos">{entry.attachments.map((image) => <Photo key={image.id} attachment={image} className="entry-photo" />)}</div>}
                    <div className="entry-footer"><span className="entry-number">ENTRY {String(entries.length - index).padStart(3, '0')}</span>{entry.attachments.length > 0 && <span className="photo-count">▧ {entry.attachments.length} {entry.attachments.length === 1 ? 'memory' : 'memories'}</span>}</div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <section className="empty-state">
              <div className="empty-emblem"><span>ᛟ</span></div>
              <div className="eyebrow"><span /> {search ? 'NO MATCHES FOUND' : 'A FRESH PAGE'}</div>
              <h2>{search ? 'No trace of that tale.' : 'The first mark is yours.'}</h2>
              <p>{search ? 'Try another name, place, or passage from the road.' : 'The pack is cinched, the trail is open. Set down the first moment worth remembering.'}</p>
              {!search && <button className="button button-outline" onClick={startNewEntry}>Begin the chronicle <span aria-hidden="true">→</span></button>}
            </section>
          )}

          <footer className="page-footer"><span>THE MOUNTAIN KEEPS ITS OWN COUNSEL</span><span>✦</span><span>YOUR STORY, YOURS ALONE</span></footer>
        </main>
      </div>

      {isComposerOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeComposer() }}>
          <section className="composer" role="dialog" aria-modal="true" aria-labelledby="composer-title">
            <div className="composer-header"><div><div className="eyebrow"><span /> THE CHRONICLE</div><h2 id="composer-title">{editingId ? 'Shape the telling' : 'Set it in stone'}</h2></div><button className="close-button" onClick={closeComposer} aria-label="Close editor">×</button></div>
            <form onSubmit={submitEntry}>
              <div className="form-row"><label className="field">DATE<input type="date" required value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></label><label className="field">PLACE<input value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="e.g. The Great Forge" maxLength={70} /></label></div>
              <label className="field">ENTRY TITLE<input autoFocus required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="What happened out there?" maxLength={100} /></label>
              <label className="field">THE TALE<textarea required rows={7} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} placeholder="The road, the company, the moment you want to keep..." maxLength={6000} /></label>
              {!editingId && <label className="field">ENTRY CODE<input type="password" inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" required maxLength={4} value={enteredCode} onChange={(event) => setEnteredCode(event.target.value.replace(/\D/g, '').slice(0, 4))} aria-describedby="entry-code-hint" /><small id="entry-code-hint" className={enteredCode.length === 4 && enteredCode !== entryCode ? 'code-hint code-hint-error' : 'code-hint'}>{enteredCode.length === 4 && enteredCode !== entryCode ? 'That code does not match.' : 'Enter the four-digit code to enable posting.'}</small></label>}
              <div className="attachment-heading"><span className="field-caption">KEEPSAKES</span><span className="attachment-hint">{draft.attachments.length} attached</span></div>
              <p className="image-size-warning">Maximum image size: 2 MB per image.</p>
              {imageWarning && <p className="image-size-warning image-size-warning-error" role="alert">{imageWarning}</p>}
              {draft.attachments.length > 0 && <div className="draft-photos">{draft.attachments.map((image) => <div className="draft-photo-wrap" key={image.id}><Photo attachment={image} className="draft-photo" /><button type="button" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.name}`}>×</button></div>)}</div>}
              <div className="composer-bottom"><label className="button button-outline upload-button"><span aria-hidden="true">▧</span> Add images<input type="file" accept="image/*" multiple onChange={addImages} /></label><span className="local-note">Images stay in this browser</span><button className="button button-copper save-button" type="submit" disabled={!editingId && enteredCode !== entryCode}>{editingId ? 'Save changes' : 'Carve Entry'} <span aria-hidden="true">→</span></button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App