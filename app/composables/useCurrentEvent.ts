import { apiFetch } from './useApi'

export interface EventListItem {
  id: string
  name: string
  slug: string
  status: string
  timezone: string
  description: string | null
  createdAt: string
  _count?: { queueTypes: number, counters: number, queues: number }
}

/**
 * Event yang sedang dikelola admin. Banyak halaman (jenis antrean, loket, form,
 * display) bekerja dalam konteks satu event, jadi pilihannya disimpan bersama
 * dan diingat antar-halaman.
 */
export function useCurrentEvent() {
  const events = useState<EventListItem[]>('antrean:events', () => [])
  const currentId = useState<string | null>('antrean:current-event', () => null)
  const pending = useState<boolean>('antrean:events-pending', () => false)

  const current = computed(() => events.value.find(e => e.id === currentId.value) ?? null)

  async function loadEvents(force = false) {
    if (events.value.length && !force) return events.value
    pending.value = true
    try {
      events.value = await apiFetch<EventListItem[]>('/api/admin/events')
      if (!currentId.value || !events.value.some(e => e.id === currentId.value)) {
        const stored = import.meta.client ? localStorage.getItem('antrean:current-event') : null
        currentId.value = events.value.find(e => e.id === stored)?.id
          ?? events.value.find(e => e.status === 'OPEN')?.id
          ?? events.value[0]?.id
          ?? null
      }
      return events.value
    }
    finally {
      pending.value = false
    }
  }

  function setCurrent(id: string) {
    currentId.value = id
    if (import.meta.client) localStorage.setItem('antrean:current-event', id)
  }

  /**
   * Saat SSR, localStorage tidak terbaca sehingga server memilih event pertama.
   * Setelah hidrasi, kembalikan ke event yang terakhir dipilih pengguna — kalau
   * tidak, pilihannya seolah terlupakan setiap kali halaman dimuat ulang penuh.
   */
  onMounted(() => {
    const stored = localStorage.getItem('antrean:current-event')
    if (!stored || stored === currentId.value) return
    if (events.value.some(e => e.id === stored)) currentId.value = stored
  })

  const options = computed(() =>
    events.value.map(e => ({ label: e.name, value: e.id, status: e.status })),
  )

  return { events, current, currentId, options, pending, loadEvents, setCurrent }
}
