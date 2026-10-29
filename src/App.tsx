import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react'
import type { User } from '@supabase/supabase-js'
import { deleteEntry, getEntries, saveEntry } from './cloudDb'
import { getEntries as getLocalEntries } from './db'
import type { Attachment, JournalEntry } from './db'
import { isSupabaseConfigured, supabase } from './supabase'

type Draft = Pick<JournalEntry, 'date' | 'title' | 'location' | 'body' | 'attachments'>

const maxImageSize = 2 * 1024 * 1024
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
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
    if (!attachment.blob) {
      setSource(attachment.url ?? '')
      return
    }
    const url = URL.createObjectURL(attachment.blob)
    setSource(url)
    return () => URL.revokeObjectURL(url)
  }, [attachment.blob, attachment.url])

  return source
    ? <img className={className} src={source} alt={attachment.name} />
    : <span className={`${className} photo-placeholder`} aria-label="Loading image" />
}

function App() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [localEntries, setLocalEntries] = useState<JournalEntry[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [search, setSearch] = useState('')
  const [isComposerOpen, setComposerOpen] = useState(false)
  const [isAuthOpen, setAuthOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>(makeDraft)
  const [authEmail, setAuthEmail] = useState('')
  const [isSendingLink, setSendingLink] = useState(false)
  const [isImporting, setImporting] = useState(false)
  const [imageWarning, setImageWarning] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function refreshEntries() {
    setEntries(await getEntries())
  }

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      setError('Cloud storage is not configured. Add your Supabase URL and public key to .env.local, then reload the site.')
      return
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setAuthReady(true)
    })

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) throw sessionError
      setUser(data.session?.user ?? null)
      setAuthReady(true)
    }).catch((loadError: unknown) => {
      setAuthReady(true)
      setError(loadError instanceof Error ? loadError.message : 'Could not restore your sign-in session.')
    })

    void refreshEntries().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : 'The public chronicle could not be loaded.')
    })
    void getLocalEntries().then(setLocalEntries).catch((loadError: unknown) => {
      setError(loadError instanceof Error
        ? `Could not check this browser for older entries: ${loadError.message}`
        : 'Could not check this browser for older entries.')
    })

    return () => subscription.unsubscribe()
  }, [])

  const unimportedEntries = user
    ? localEntries.filter((localEntry) => !entries.some((entry) => entry.id === localEntry.id && entry.ownerId === user.id))
    : []
  const visibleEntries = entries.filter((entry) => {
    const query = search.trim().toLocaleLowerCase()
    return !query || [entry.title, entry.location, entry.body].some((value) => value.toLocaleLowerCase().includes(query))
  })
  const journeyDays = new Set(entries.map((entry) => entry.date)).size
  const photoCount = entries.reduce((total, entry) => total + entry.attachments.length, 0)

  function startNewEntry() {
    if (!user) {
      setAuthOpen(true)
      return
    }
    setEditingId(null)
    setDraft(makeDraft())
    setImageWarning('')
    setComposerOpen(true)
  }

  function startEditing(entry: JournalEntry) {
    if (!user || entry.ownerId !== user.id) return
    setEditingId(entry.id)
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
    setImageWarning('')
  }

  async function requestSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSendingLink(true)
    setError('')
    try {
      const { error: signInError } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { emailRedirectTo: window.location.origin + window.location.pathname },
      })
      if (signInError) throw signInError
      setAuthOpen(false)
      setAuthEmail('')
      setMessage('Check your email for a secure sign-in link.')
      window.setTimeout(() => setMessage(''), 5000)
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : 'Could not send the sign-in link.')
    } finally {
      setSendingLink(false)
    }
  }

  async function signOut() {
    if (!supabase) return
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setError(`Could not sign out: ${signOutError.message}`)
      return
    }
    setMessage('You have signed out.')
    window.setTimeout(() => setMessage(''), 2600)
  }

  async function importLocalArchive() {
    if (!user || unimportedEntries.length === 0) return
    setImporting(true)
    setError('')
    let importedCount = 0
    try {
      for (const entry of unimportedEntries) {
        await saveEntry({ ...entry, ownerId: user.id }, user.id)
        importedCount += 1
      }
      await refreshEntries()
      setMessage(`Imported ${importedCount} ${importedCount === 1 ? 'entry' : 'entries'} from this browser.`)
      window.setTimeout(() => setMessage(''), 5000)
    } catch (importError) {
      const detail = importError instanceof Error ? importError.message : 'The remaining entries could not be imported.'
      let refreshDetail = ''
      try {
        await refreshEntries()
      } catch (refreshError) {
        refreshDetail = ` The cloud archive could not be refreshed: ${refreshError instanceof Error ? refreshError.message : 'unknown error'}.`
      }
      setError(`Imported ${importedCount} of ${unimportedEntries.length} entries. ${detail} You can retry the import.${refreshDetail}`)
    } finally {
      setImporting(false)
    }
  }

  async function submitEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!user) {
      setError('Sign in before adding or editing entries.')
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
      ownerId: existing?.ownerId ?? user.id,
    }

    try {
      await saveEntry(entry, user.id)
      await refreshEntries()
      closeComposer()
      setMessage(editingId ? 'Entry updated' : 'Entry added to the public chronicle')
      window.setTimeout(() => setMessage(''), 2600)
      setError('')
    } catch (saveError) {
      let refreshDetail = ''
      try {
        await refreshEntries()
      } catch (refreshError) {
        refreshDetail = ` The chronicle could not be refreshed: ${refreshError instanceof Error ? refreshError.message : 'unknown error'}.`
      }
      setError(`${saveError instanceof Error ? saveError.message : 'Your entry could not be saved.'}${refreshDetail}`)
    }
  }

  async function removeEntry(entry: JournalEntry) {
    if (!user || entry.ownerId !== user.id) return
    if (!window.confirm(`Remove “${entry.title}” from your chronicle?`)) return
    try {
      await deleteEntry(entry.id, user.id)
      await refreshEntries()
      setMessage('Entry removed')
      window.setTimeout(() => setMessage(''), 2600)
    } catch (deleteError) {
      let refreshDetail = ''
      try {
        await refreshEntries()
      } catch (refreshError) {
        refreshDetail = ` The chronicle could not be refreshed: ${refreshError instanceof Error ? refreshError.message : 'unknown error'}.`
      }
      setError(`${deleteError instanceof Error ? deleteError.message : 'This entry could not be removed.'}${refreshDetail}`)
    }
  }

  function addImages(event: ChangeEvent<HTMLInputElement>) {
    const selectedImages = Array.from(event.target.files ?? []).filter((file) => file.type.startsWith('image/'))
    const supportedImages = selectedImages.filter((file) => supportedImageTypes.has(file.type))
    const files = supportedImages.filter((file) => file.size <= maxImageSize)
    const warningParts: string[] = []
    const unsupportedCount = selectedImages.length - supportedImages.length
    const oversizedCount = supportedImages.length - files.length
    if (unsupportedCount > 0) warningParts.push(`${unsupportedCount} image${unsupportedCount === 1 ? ' was' : 's were'} not supported. Use JPEG, PNG, WebP, GIF, or AVIF.`)
    if (oversizedCount > 0) warningParts.push(`${oversizedCount} image${oversizedCount === 1 ? '' : 's'} exceeded 2 MB and ${oversizedCount === 1 ? 'was' : 'were'} not attached.`)
    setImageWarning(warningParts.join(' '))
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
          <span className="realm-label"><span className="status-dot" /> PUBLIC CHRONICLE</span>
          {user && <span className="account-email" title={user.email ?? ''}>{user.email}</span>}
          {authReady && (user
            ? <button className="button button-outline account-button" onClick={signOut}>Sign out</button>
            : <button className="button button-outline account-button" onClick={() => setAuthOpen(true)} disabled={!isSupabaseConfigured}>Sign in to write</button>)}
          {user && <button className="button button-copper top-new" onClick={startNewEntry}><span aria-hidden="true">+</span> New entry</button>}
        </div>
      </header>

      <div className="page-frame" id="top">
        <aside className="sidebar">
          <div className="sidebar-heading">THE CHRONICLE</div>
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
              <div><h1>The Long Way Across <i>Azeroth</i></h1><p>Every road leaves a story. Read the tales and add your own.</p></div>
              {user && <button className="button button-copper intro-new" onClick={startNewEntry}><span aria-hidden="true">+</span> Write an entry</button>}
            </div>
          </section>

          <section className="archive-bar" aria-label="Journal summary">
            <div className="archive-label"><span className="archive-glyph">⌖</span><div><strong>ADVENTURE ARCHIVE</strong><small>{entries.length === 1 ? '1 entry inscribed' : `${entries.length} entries inscribed`}</small></div></div>
            <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search the archive" aria-label="Search entries" /><kbd>/</kbd></label>
          </section>

          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {message && <div className="notice notice-success" role="status">{message}</div>}
          {unimportedEntries.length > 0 && (
            <section className="archive-import" aria-label="Import your previous entries">
              <div><strong>Older entries found in this browser</strong><small>{unimportedEntries.length} {unimportedEntries.length === 1 ? 'entry is' : 'entries are'} not in the cloud archive yet.</small></div>
              <button className="button button-outline" onClick={importLocalArchive} disabled={isImporting}>{isImporting ? 'Importing…' : 'Import browser archive'}</button>
            </section>
          )}

          {visibleEntries.length > 0 ? (
            <div className="entries-list">
              {visibleEntries.map((entry, index) => (
                <article className="entry" key={entry.id}>
                  <div className="entry-rail"><span className="rail-dot" /><span className="rail-line" /></div>
                  <div className="entry-card">
                    <div className="entry-meta"><time dateTime={entry.date}>{formatDate(entry.date)}</time><span className="entry-separator">·</span><span className="location"><span aria-hidden="true">⌖</span> {entry.location || 'Somewhere in Azeroth'}</span>{user?.id === entry.ownerId && <div className="entry-actions"><button aria-label={`Edit ${entry.title}`} title="Edit entry" onClick={() => startEditing(entry)}>✎</button><button aria-label={`Delete ${entry.title}`} title="Delete entry" onClick={() => removeEntry(entry)}>×</button></div>}</div>
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
              {!search && (user || isSupabaseConfigured) && <button className="button button-outline" onClick={startNewEntry}>{user ? 'Begin the chronicle' : 'Sign in to write'} <span aria-hidden="true">→</span></button>}
            </section>
          )}

          <footer className="page-footer"><span>THE MOUNTAIN KEEPS ITS OWN COUNSEL</span><span>✦</span><span>THE CHRONICLE IS OPEN TO ALL</span></footer>
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
              <div className="attachment-heading"><span className="field-caption">KEEPSAKES</span><span className="attachment-hint">{draft.attachments.length} attached</span></div>
              <p className="image-size-warning">Maximum image size: 2 MB per image.</p>
              {imageWarning && <p className="image-size-warning image-size-warning-error" role="alert">{imageWarning}</p>}
              {draft.attachments.length > 0 && <div className="draft-photos">{draft.attachments.map((image) => <div className="draft-photo-wrap" key={image.id}><Photo attachment={image} className="draft-photo" /><button type="button" onClick={() => removeImage(image.id)} aria-label={`Remove ${image.name}`}>×</button></div>)}</div>}
              <div className="composer-bottom"><label className="button button-outline upload-button"><span aria-hidden="true">▧</span> Add images<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple onChange={addImages} /></label><span className="local-note">Images saved with the chronicle</span><button className="button button-copper save-button" type="submit">{editingId ? 'Save changes' : 'Carve Entry'} <span aria-hidden="true">→</span></button></div>
            </form>
          </section>
        </div>
      )}

      {isAuthOpen && (
        <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false) }}>
          <section className="composer auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
            <div className="composer-header"><div><div className="eyebrow"><span /> THE CHRONICLE</div><h2 id="auth-title">Sign in to write</h2></div><button className="close-button" onClick={() => setAuthOpen(false)} aria-label="Close sign in">×</button></div>
            <p className="auth-explanation">Enter your email and we’ll send a one-time sign-in link. You can read the public archive without signing in.</p>
            {error && <div className="notice notice-error" role="alert">{error}</div>}
            <form onSubmit={requestSignIn}>
              <label className="field">EMAIL ADDRESS<input type="email" autoComplete="email" autoFocus required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>
              <div className="composer-bottom"><button type="button" className="button button-outline" onClick={() => setAuthOpen(false)}>Cancel</button><button className="button button-copper save-button" type="submit" disabled={isSendingLink}>{isSendingLink ? 'Sending…' : 'Email me a sign-in link'}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}

export default App