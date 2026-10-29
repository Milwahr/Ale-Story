import type { JournalEntry } from './db'
import { supabase } from './supabase'

const imageBucket = 'journal-images'

type StoredAttachment = {
  id: string
  name: string
  type: string
  path: string
}

function getClient() {
  if (!supabase) throw new Error('Cloud storage is not configured. Add the Supabase settings to .env.local.')
  return supabase
}

function toJournalEntry(row: {
  id: string
  owner_id: string
  date: string
  title: string
  location: string
  body: string
  attachments: StoredAttachment[]
  created_at: string
  updated_at: string
}): JournalEntry {
  const client = getClient()
  return {
    id: row.id,
    ownerId: row.owner_id,
    date: row.date,
    title: row.title,
    location: row.location,
    body: row.body,
    attachments: row.attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.name,
      type: attachment.type,
      storagePath: attachment.path,
      url: client.storage.from(imageBucket).getPublicUrl(attachment.path).data.publicUrl,
    })),
    createdAt: Date.parse(row.created_at),
    updatedAt: Date.parse(row.updated_at),
  }
}

async function removeImages(paths: string[], successMessage: string) {
  if (paths.length === 0) return
  const { error } = await getClient().storage.from(imageBucket).remove(paths)
  if (error) throw new Error(`${successMessage}: ${error.message}`)
}

export async function getEntries(): Promise<JournalEntry[]> {
  const { data, error } = await getClient()
    .from('entries')
    .select('*')
    .order('date', { ascending: false })
    .order('updated_at', { ascending: false })
  if (error) throw new Error(`Could not load the public chronicle: ${error.message}`)
  return data.map(toJournalEntry)
}

export async function saveEntry(entry: JournalEntry, userId: string): Promise<void> {
  const client = getClient()
  if (entry.ownerId && entry.ownerId !== userId) {
    throw new Error('You can only save entries under your own account.')
  }
  const { data: existing, error: lookupError } = await client
    .from('entries')
    .select('owner_id, attachments')
    .eq('id', entry.id)
    .maybeSingle()
  if (lookupError) throw new Error(`Could not check the existing entry: ${lookupError.message}`)
  if (existing && existing.owner_id !== userId) {
    throw new Error('You can only edit entries you created.')
  }

  const uploadedPaths: string[] = []
  const existingPaths = new Set((existing?.attachments ?? []).map((attachment) => attachment.path))
  const attachments: StoredAttachment[] = []
  try {
    for (const attachment of entry.attachments) {
      let path = attachment.storagePath
      if (attachment.blob) {
        path = `${userId}/${entry.id}/${attachment.id}`
        const { error } = await client.storage.from(imageBucket).upload(path, attachment.blob, {
          contentType: attachment.type,
          upsert: true,
        })
        if (error) throw new Error(`Could not upload ${attachment.name}: ${error.message}`)
        uploadedPaths.push(path)
      }
      if (!path) throw new Error(`Image ${attachment.name} has no file data to save.`)
      attachments.push({ id: attachment.id, name: attachment.name, type: attachment.type, path })
    }

    const { error } = await client.from('entries').upsert({
      id: entry.id,
      owner_id: entry.ownerId ?? userId,
      date: entry.date,
      title: entry.title,
      location: entry.location,
      body: entry.body,
      attachments,
      created_at: new Date(entry.createdAt).toISOString(),
      updated_at: new Date(entry.updatedAt).toISOString(),
    })
    if (error) throw new Error(`Could not save this entry: ${error.message}`)
  } catch (error) {
    const newPaths = uploadedPaths.filter((path) => !existingPaths.has(path))
    if (newPaths.length > 0) {
      const { error: cleanupError } = await client.storage.from(imageBucket).remove(newPaths)
      if (cleanupError) {
        const message = error instanceof Error ? error.message : 'Could not save this entry.'
        throw new Error(`${message} Uploaded images could not be cleaned up: ${cleanupError.message}`)
      }
    }
    throw error
  }

  const keptPaths = new Set(attachments.map((attachment) => attachment.path))
  const removedPaths = (existing?.attachments ?? [])
    .map((attachment) => attachment.path)
    .filter((path) => !keptPaths.has(path))
  await removeImages(removedPaths, 'Entry was saved, but old images could not be removed')
}

export async function deleteEntry(id: string, userId: string): Promise<void> {
  const client = getClient()
  const { data: existing, error: lookupError } = await client
    .from('entries')
    .select('owner_id, attachments')
    .eq('id', id)
    .maybeSingle()
  if (lookupError) throw new Error(`Could not check the entry before deletion: ${lookupError.message}`)
  if (!existing) return
  if (existing.owner_id !== userId) throw new Error('You can only remove entries you created.')

  const { error } = await client.from('entries').delete().eq('id', id).eq('owner_id', userId)
  if (error) throw new Error(`Could not remove this entry: ${error.message}`)
  await removeImages(existing.attachments.map((attachment) => attachment.path), 'Entry was removed, but its images could not be removed')
}
