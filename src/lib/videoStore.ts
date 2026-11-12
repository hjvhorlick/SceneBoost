const DB_NAME = 'scenboost_videos_v1'
const STORE_NAME = 'post_videos'

interface StoredVideoRecord {
  postId: string
  name: string
  type: string
  lastModified: number
  blob: Blob
}

function openVideoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'postId' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('Could not open IndexedDB'))
  })
}

export async function saveVideoFileForPost(postId: string, file: File): Promise<void> {
  try {
    const db = await openVideoDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const rec: StoredVideoRecord = {
        postId,
        name: file.name,
        type: file.type || 'video/mp4',
        lastModified: file.lastModified || Date.now(),
        blob: file,
      }
      store.put(rec)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error ?? new Error('Failed to store video file'))
      }
    })
  } catch {
    // Non-fatal fallback if browser blocks IndexedDB in private mode
  }
}

export async function loadVideoFileForPost(postId: string): Promise<File | null> {
  try {
    const db = await openVideoDb()
    return await new Promise<File | null>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(postId)
      req.onsuccess = () => {
        const rec = req.result as StoredVideoRecord | undefined
        db.close()
        if (!rec?.blob) {
          resolve(null)
          return
        }
        resolve(
          new File([rec.blob], rec.name || 'video.mp4', {
            type: rec.type || 'video/mp4',
            lastModified: rec.lastModified || Date.now(),
          })
        )
      }
      req.onerror = () => {
        db.close()
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

export async function deleteVideoFileForPost(postId: string): Promise<void> {
  try {
    const db = await openVideoDb()
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(postId)
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        resolve()
      }
    })
  } catch {
    // ignore
  }
}
