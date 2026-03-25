export const STORE_LABEL = { dobong: '도봉점', yangju: '양주점', all: '전체' }
export const ROLE_LABEL  = { master: '마스터', manager: '매니저', staff: '직원' }
export const DEFAULT_PWD = 'ansrlcjf4021!'
export const MASTER_ACCOUNTS = [
  { id: 'master_1', username: 'master' },
  { id: 'master_2', username: 'tommybaby' },
  { id: 'master_3', username: 'yaguyagu' },
]

export function today() {
  return new Date().toISOString().split('T')[0]
}

// KST 기준 오늘 날짜 문자열 반환 (YYYY-MM-DD)
export function todayKST() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  return kst.toISOString().split('T')[0]
}

export function fmtDate(s) {
  if (!s) return '-'
  const parts = s.split('-')
  if (parts.length !== 3) return s
  return `${parseInt(parts[0])}년 ${parseInt(parts[1])}월 ${parseInt(parts[2])}일`
}

// 날짜 문자열(YYYY-MM-DD)까지 남은 일수 계산 (KST 기준, 시간대 오류 없음)
export function daysUntil(s) {
  if (!s) return null
  const [ty, tm, td] = s.split('-').map(Number)
  const targetMs = Date.UTC(ty, tm - 1, td)
  // 현재 KST 날짜
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const todayStr = kst.toISOString().split('T')[0]
  const [ny, nm, nd] = todayStr.split('-').map(Number)
  const todayMs = Date.UTC(ny, nm - 1, nd)
  return Math.round((targetMs - todayMs) / 86400000)
}

export function effDate(c) {
  return c.type === 'pregnant' ? (c.actualBirthDate || c.dueDate) : c.birthDate
}

export function effType(c) {
  return (c.type === 'pregnant' && c.actualBirthDate) ? 'normal' : c.type
}

export function hashPwd(s) {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0 }
  return Math.abs(h).toString(16).padStart(8, '0')
}

export function genId() {
  return 'c' + Date.now() + Math.random().toString(36).slice(2, 5)
}

export function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

export function buildGifts(type, base) {
  if (!base) return []
  // YYYY-MM-DD 문자열을 로컬 Date로 안전하게 파싱
  const [y, m, d] = base.split('-').map(Number)
  const baseDate = new Date(y, m - 1, d)
  const gifts = []
  if (type === 'pregnant') gifts.push({ label: '출산 축하 선물 🎀', date: base, sent: false })
  for (let yr = 1; yr <= 3; yr++) {
    const nd = new Date(baseDate)
    nd.setFullYear(nd.getFullYear() + yr)
    const dateStr = nd.getFullYear() + '-' +
      String(nd.getMonth() + 1).padStart(2, '0') + '-' +
      String(nd.getDate()).padStart(2, '0')
    gifts.push({
      label: yr === 3 ? '세 번째 생일 선물 🎂 (36개월)' : `${['첫', '두', '세'][yr - 1]} 번째 생일 선물 🎁`,
      date: dateStr,
      sent: false
    })
  }
  return gifts
}

export function getGifts(c) {
  return (c.gifts && c.gifts.length) ? c.gifts : buildGifts(c.type, effDate(c))
}

export function can(role, action) {
  const perms = {
    viewAll:     ['master', 'manager'],
    markSent:    ['master', 'manager'],
    deleteCust:  ['master'],
    manageUsers: ['master'],
  }
  return (perms[action] || []).includes(role)
}

export function getSavedCreds() {
  try { return JSON.parse(localStorage.getItem('bss_saved_creds') || '{}') } catch { return {} }
}
