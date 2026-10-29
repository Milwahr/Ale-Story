export type Attachment = {
  id: string
  name: string
  type: string
  blob?: Blob
  storagePath?: string
  url?: string
}

export type JournalEntry = {
  id: string
  date: string
  title: string
  location: string
  body: string
  attachments: Attachment[]
  createdAt: number
  updatedAt: number
  ownerId?: string
}

const databaseName = 'stone-and-story'
const storeName = 'entries'
let databasePromise: Promise<IDBDatabase> | undefined

function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1)

    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        const store = database.createObjectStore(storeName, { keyPath: 'id' })
        store.createIndex('date', 'date')
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open the journal database.'))
  })

  return databasePromise
}

export async function getEntries(): Promise<JournalEntry[]> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => {
      const entries = request.result as JournalEntry[]
      resolve(entries.sort((left, right) => right.date.localeCompare(left.date) || right.updatedAt - left.updatedAt))
    }
    request.onerror = () => reject(request.error ?? new Error('Could not load journal entries.'))
  })
}

export async function saveEntry(entry: JournalEntry): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(entry)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this entry.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Saving this entry was cancelled.'))
  })
}

export async function deleteEntry(id: string): Promise<void> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete this entry.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Deleting this entry was cancelled.'))
  })
}