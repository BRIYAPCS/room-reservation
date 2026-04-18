import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dir = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dir, '../data/db.json')

// ── Seed data ─────────────────────────────────────────────────

const SITES = [
  {
    id: 'fort-totten',
    name: 'Fort Totten',
    image: 'https://placehold.co/300x200/7a8fa6/ffffff?text=Fort+Totten',
    rooms: [
      { id: 'conference-room', name: 'Conference Room A', capacity: 20, image: 'https://placehold.co/300x200/a0b4c8/333333?text=Conference+Room+A' },
      { id: 'training-room',   name: 'Training Room',     capacity: 30, image: 'https://placehold.co/300x200/b0c4d8/333333?text=Training+Room' },
      { id: 'board-room',      name: 'Board Room',        capacity: 10, image: 'https://placehold.co/300x200/c0d4e8/333333?text=Board+Room' },
    ],
  },
  {
    id: 'shepherd',
    name: 'Shepherd',
    image: 'https://placehold.co/300x200/8b6f5e/ffffff?text=Shepherd',
    rooms: [
      { id: 'main-hall',     name: 'Main Hall',     capacity: 50, image: 'https://placehold.co/300x200/b09080/333333?text=Main+Hall' },
      { id: 'meeting-room-1', name: 'Meeting Room 1', capacity: 15, image: 'https://placehold.co/300x200/c0a090/333333?text=Meeting+Room+1' },
    ],
  },
  {
    id: 'ontario',
    name: 'Ontario',
    image: 'https://placehold.co/300x200/6b7a8d/ffffff?text=Ontario',
    rooms: [
      { id: 'bletzinger',      name: 'Bletzinger Classroom (25)',       capacity: 25, image: 'https://placehold.co/300x200/c8b89a/333333?text=Bletzinger+Classroom' },
      { id: 'green-classroom', name: 'Green Classroom',                  capacity: 20, image: 'https://placehold.co/300x200/98b898/333333?text=Green+Classroom' },
      { id: 'it-testing-room', name: 'IT/Testing Room',                  capacity: 10, image: 'https://placehold.co/300x200/d4a880/333333?text=IT+Testing+Room' },
      { id: 'zoom-conf-2nd',   name: 'Zoom Conf 2nd Floor',             capacity: 6,  image: 'https://placehold.co/300x200/b8c8d8/333333?text=Zoom+Conf+2nd+Floor' },
      { id: 'zoom-spot-testing', name: 'Zoom Spot (1) Inside Testing Room', capacity: 1, image: 'https://placehold.co/300x200/d4b8a0/333333?text=Zoom+Spot' },
    ],
  },
  {
    id: 'georgia',
    name: 'Georgia',
    image: 'https://placehold.co/300x200/9aafa0/ffffff?text=Georgia',
    rooms: [
      { id: 'classroom-1',  name: 'Classroom 1',  capacity: 20, image: 'https://placehold.co/300x200/a8c0b0/333333?text=Classroom+1' },
      { id: 'computer-lab', name: 'Computer Lab', capacity: 15, image: 'https://placehold.co/300x200/b8d0c0/333333?text=Computer+Lab' },
    ],
  },
  {
    id: 'georgia-annex',
    name: 'Georgia Annex',
    image: 'https://placehold.co/300x200/a0a8b0/ffffff?text=Georgia+Annex',
    rooms: [
      { id: 'small-room', name: 'Small Meeting Room', capacity: 8,  image: 'https://placehold.co/300x200/c0c8d0/333333?text=Small+Meeting+Room' },
      { id: 'flex-space', name: 'Flex Space',         capacity: 12, image: 'https://placehold.co/300x200/d0d8e0/333333?text=Flex+Space' },
    ],
  },
]

function weekdaysBetween(start, end) {
  const dates = []
  const cur = new Date(start)
  while (cur <= end) {
    const d = cur.getDay()
    if (d >= 1 && d <= 5) dates.push(cur.toISOString().split('T')[0])
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}

function generateSeedEvents() {
  const from = new Date('2026-03-23')
  const to   = new Date('2026-05-31')
  const weekdays = weekdaysBetween(from, to)
  const events = []

  weekdays.forEach(date => {
    events.push({
      id: `cares-${date}`,
      title: 'CARES Classroom (Kirsten Wittkowski)',
      start: `${date}T08:30:00`,
      end:   `${date}T12:00:00`,
      backgroundColor: '#4abfce',
      borderColor: '#3aaebe',
      extendedProps: { bookedBy: 'Kirsten Wittkowski', description: '', rawTitle: 'CARES Classroom' },
    })
  })

  const tuesdays = weekdays.filter(d => new Date(d).getDay() === 2)
  tuesdays.forEach(date => {
    events.push({
      id: `ont-coord-${date}`,
      title: 'ONT Coordination Meeting (Kirsten Wittkowski)',
      start: `${date}T15:00:00`,
      end:   `${date}T16:00:00`,
      backgroundColor: '#4abfce',
      borderColor: '#3aaebe',
      extendedProps: { bookedBy: 'Kirsten Wittkowski', description: '', rawTitle: 'ONT Coordination Meeting' },
    })
  })

  return events
}

function buildSeed() {
  return {
    sites: SITES,
    events: {
      'ontario-it-testing-room': generateSeedEvents(),
    },
  }
}

// ── File helpers ───────────────────────────────────────────────

function readDB() {
  if (!existsSync(DB_PATH)) {
    const seed = buildSeed()
    const dir = dirname(DB_PATH)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    writeFileSync(DB_PATH, JSON.stringify(seed, null, 2))
    return seed
  }
  return JSON.parse(readFileSync(DB_PATH, 'utf-8'))
}

function writeDB(db) {
  writeFileSync(DB_PATH, JSON.stringify(db, null, 2))
}

// ── Public API ─────────────────────────────────────────────────

export function getSites() {
  return readDB().sites
}

export function getSite(siteId) {
  return readDB().sites.find(s => s.id === siteId) || null
}

export function getRoom(siteId, roomId) {
  const site = getSite(siteId)
  return site?.rooms.find(r => r.id === roomId) || null
}

export function getEvents(siteId, roomId) {
  const db = readDB()
  const key = `${siteId}-${roomId}`
  return db.events[key] || []
}

export function addEvents(siteId, roomId, newEvents) {
  const db = readDB()
  const key = `${siteId}-${roomId}`
  if (!db.events[key]) db.events[key] = []
  db.events[key].push(...newEvents)
  writeDB(db)
}

export function updateEvent(siteId, roomId, updatedEvent) {
  const db = readDB()
  const key = `${siteId}-${roomId}`
  if (!db.events[key]) return
  const idx = db.events[key].findIndex(e => e.id === updatedEvent.id)
  if (idx !== -1) {
    db.events[key][idx] = {
      ...db.events[key][idx],
      ...updatedEvent,
      extendedProps: {
        ...db.events[key][idx].extendedProps,
        ...updatedEvent.extendedProps,
      },
    }
    writeDB(db)
  }
}

export function deleteEvent(siteId, roomId, eventId) {
  const db = readDB()
  const key = `${siteId}-${roomId}`
  if (!db.events[key]) return
  db.events[key] = db.events[key].filter(e => e.id !== eventId)
  writeDB(db)
}
