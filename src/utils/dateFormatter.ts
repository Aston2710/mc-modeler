export function formatRelativeTime(isoDate: string, lang: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (lang === 'es') {
    if (secs < 60) return 'hace un momento'
    if (mins < 60) return `hace ${mins} min`
    if (hours < 24) return `hace ${hours} h`
    if (days === 1) return 'ayer'
    if (days < 7) return `hace ${days} días`
    return date.toLocaleDateString('es')
  } else {
    if (secs < 60) return 'just now'
    if (mins < 60) return `${mins}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days === 1) return 'yesterday'
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString('en')
  }
}

export function formatSaveTime(isoDate: string, lang: string): string {
  const date = new Date(isoDate)
  const now = new Date()
  const secs = Math.floor((now.getTime() - date.getTime()) / 1000)

  if (lang === 'es') {
    if (secs < 5) return ''
    if (secs < 60) return `${secs} s`
    const mins = Math.floor(secs / 60)
    return `${mins} min`
  } else {
    if (secs < 5) return ''
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    return `${mins}m`
  }
}
