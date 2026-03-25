import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { hashPwd, todayKST, MASTER_ACCOUNTS, DEFAULT_PWD, getSavedCreds, ROLE_LABEL, STORE_LABEL } from '../utils'
import Dashboard from './Dashboard'
import CustomerList from './CustomerList'
import StaffManagement from './StaffManagement'

// ── Contexts ──
const AuthCtx  = createContext(null)
const ToastCtx = createContext(null)
export const useAuth  = () => useContext(AuthCtx)
export const useToast = () => useContext(ToastCtx)

// ── Toast ──
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const show = useCallback((msg, icon = '✅') => {
    const id = Date.now()
    setToasts(t => [...t, { id, msg, icon }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className="toast-item">{t.icon} {t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  )
}

// ── VAPID Push ──
const VAPID_PUBLIC = 'BKWzJf5mFTh57wdROQ5yHXPF--qDhm5mrO-wjyArI8XGSlbWmS8Ag-HxtCWesW_NNHxfbRIrh_RfrjIDuVeMm3Q'

function urlB64ToUint8(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4)
  const raw = window.atob((b64 + pad).replace(/-/g,'+').replace(/_/g,'/'))
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

async function subscribePush(userId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(VAPID_PUBLIC) })
    }
    const endpoint = sub.endpoint
    const id = userId + '_' + endpoint.slice(-16).replace(/[^a-zA-Z0-9]/g, '')
    await supabase.from('push_subscriptions').upsert([{
      id,
      user_id: userId,
      subscription: sub.toJSON(),
      createdAt: todayKST()
    }], { onConflict: 'id' })
  } catch(e) { console.error('subscribePush error:', e) }
}

async function unsubscribePush(userId) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('user_id', userId)
  } catch(e) { console.error('unsubscribePush error:', e) }
}

async function sendPushToAll(title, body, tag) {
  const { data: subs } = await supabase.from('push_subscriptions').select('subscription')
  if (!subs?.length) return
  const results = await Promise.allSettled(subs.map(row =>
    fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: row.subscription, title, body, tag })
    })
  ))
  // 실패한 push 로그
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.warn('Push failed for subscription', i, r.reason)
  })
}

// ── Ensure masters ──
async function ensureMasters() {
  const toUpsert = MASTER_ACCOUNTS.map(m => ({
    ...m, pwd: hashPwd(DEFAULT_PWD), role:'master', store:'all', approved:true, active:true, createdAt: todayKST()
  }))
  await supabase.from('users').upsert(toUpsert, { onConflict: 'id', ignoreDuplicates: true })
}

// ── Root ──
export default function AdminApp() {
  return <ToastProvider><AdminRoot/></ToastProvider>
}

function AdminRoot() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      await ensureMasters()
      const saved = getSavedCreds()
      if (saved.username && saved.password) {
        const { data } = await supabase.from('users').select('*').eq('username', saved.username).single()
        if (data && data.pwd === hashPwd(saved.password) && data.approved && data.active) {
          setUser(data)
        }
      }
      setLoading(false)
    }
    init()
  }, [])

  const login = async (username, password, remember) => {
    const { data } = await supabase.from('users').select('*').eq('username', username).single()
    if (!data) return '아이디 또는 비밀번호가 올바르지 않습니다.'
    if (data.pwd !== hashPwd(password)) return '아이디 또는 비밀번호가 올바르지 않습니다.'
    if (!data.approved) return '승인 대기 중입니다. 마스터에게 문의해주세요.'
    if (!data.active) return '비활성화된 계정입니다. 마스터에게 문의해주세요.'
    if (remember) localStorage.setItem('bss_saved_creds', JSON.stringify({ username, password }))
    else localStorage.removeItem('bss_saved_creds')
    setUser(data)
    return null
  }

  const logout = () => {
    localStorage.removeItem('bss_saved_creds')
    setUser(null)
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#1a1714', display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,.4)', fontSize:14 }}>
      불러오는 중...
    </div>
  )

  return (
    <AuthCtx.Provider value={{ user, login, logout }}>
      {!user ? <AuthScreen/> : <AppShell key={user.id}/>}
    </AuthCtx.Provider>
  )
}

// ── Auth Screen ──
function AuthScreen() {
  const [view, setView] = useState('login')
  const bg = { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(160deg,#1a1714 0%,#2d2a26 60%,#3a3530 100%)', padding:20 }
  const box = { width:'100%', maxWidth:400, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.10)', borderRadius:24, padding:'36px 28px', backdropFilter:'blur(10px)' }
  return (
    <div style={bg}>
      <div style={box}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:20, fontWeight:700, color:'#fff' }}>BABY HAÜS</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,.45)', marginTop:4 }}>관리자 시스템</div>
        </div>
        {view==='login'    && <LoginForm    onRegister={()=>setView('register')}/>}
        {view==='register' && <RegisterForm onBack={()=>setView('login')} onSuccess={()=>setView('success')}/>}
        {view==='success'  && <SuccessView  onLogin={()=>setView('login')}/>}
      </div>
    </div>
  )
}

const inp = { width:'100%', padding:'13px 15px', border:'1.5px solid rgba(255,255,255,.15)', borderRadius:'var(--radius-sm)', fontSize:15, fontFamily:'var(--font)', color:'#fff', background:'rgba(255,255,255,.07)', outline:'none', marginBottom:12 }

function LoginForm({ onRegister }) {
  const { login } = useAuth()
  const [id, setId] = useState('')
  const [pw, setPw] = useState('')
  const [remember, setRemember] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const saved = getSavedCreds()
    if (saved.username) { setId(saved.username); setPw(saved.password||''); setRemember(true) }
  }, [])

  const submit = async () => {
    if (!id||!pw) { setErr('아이디와 비밀번호를 입력해주세요.'); return }
    setLoading(true); setErr('')
    const e = await login(id, pw, remember)
    setLoading(false)
    if (e) setErr(e)
  }

  return (
    <>
      <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:20 }}>로그인</div>
      {err && <div style={{ background:'rgba(232,133,106,.15)', border:'1px solid rgba(232,133,106,.4)', borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:13, color:'#f4a58a', marginBottom:12 }}>{err}</div>}
      <input style={inp} type="text" placeholder="아이디" value={id} onChange={e=>setId(e.target.value)} autoComplete="username"/>
      <input style={inp} type="password" placeholder="비밀번호" value={pw} onChange={e=>setPw(e.target.value)} autoComplete="current-password" onKeyDown={e=>e.key==='Enter'&&submit()}/>
      <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:16, color:'rgba(255,255,255,.5)', fontSize:13 }}>
        <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)} style={{ width:18, height:18, accentColor:'var(--sage)' }}/>
        아이디·비밀번호 저장
      </label>
      <button onClick={submit} disabled={loading} style={{ width:'100%', padding:14, border:'none', borderRadius:'var(--radius-sm)', background:'linear-gradient(135deg,var(--sage),var(--sage-dark))', color:'#fff', fontSize:15, fontWeight:700, fontFamily:'var(--font)', cursor:'pointer' }}>
        {loading ? '로그인 중...' : '로그인'}
      </button>
      <div style={{ textAlign:'center', marginTop:18, fontSize:13, color:'rgba(255,255,255,.4)' }}>
        직원 계정이 없으신가요? <a onClick={onRegister} style={{ color:'var(--sage)', cursor:'pointer' }}>회원가입 →</a>
      </div>
    </>
  )
}

function RegisterForm({ onBack, onSuccess }) {
  const [rid, setRid] = useState('')
  const [rpw, setRpw] = useState('')
  const [rpw2, setRpw2] = useState('')
  const [store, setStore] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    if (!rid||rid.length<3) { setErr('아이디는 3자 이상이어야 합니다.'); return }
    if (!/^[a-zA-Z0-9_]+$/.test(rid)) { setErr('아이디는 영문/숫자/밑줄만 사용 가능합니다.'); return }
    if (!rpw||rpw.length<6) { setErr('비밀번호는 6자 이상이어야 합니다.'); return }
    if (rpw!==rpw2) { setErr('비밀번호가 일치하지 않습니다.'); return }
    if (!store) { setErr('소속 매장을 선택해주세요.'); return }
    setLoading(true); setErr('')
    const { data: ex } = await supabase.from('users').select('id').eq('username', rid)
    if (ex?.length) { setErr('이미 사용 중인 아이디입니다.'); setLoading(false); return }

    const newUserId = 'u_' + Date.now()
    const { error } = await supabase.from('users').insert([{
      id: newUserId, username: rid, pwd: hashPwd(rpw),
      role: 'staff', store, approved: false, active: true, createdAt: todayKST()
    }])

    if (error) { setErr('가입 중 오류가 발생했습니다.'); setLoading(false); return }

    // 가입 완료 후 마스터에게 푸시 알림 발송
    try {
      // 마스터의 push subscription만 가져옴
      const masterIds = MASTER_ACCOUNTS.map(m => m.id)
      const { data: masterSubs } = await supabase
        .from('push_subscriptions')
        .select('subscription')
        .in('user_id', masterIds)

      if (masterSubs?.length) {
        const title = '👤 신규 직원 가입 대기 · BABY HAÜS'
        const body = `@${rid} (${STORE_LABEL[store]||store}) 승인 대기 중입니다`
        await Promise.allSettled(masterSubs.map(row =>
          fetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subscription: row.subscription, title, body, tag: `staff-${newUserId}` })
          })
        ))
      }
    } catch(e) { console.error('Push to masters failed:', e) }

    setLoading(false)
    onSuccess()
  }

  return (
    <>
      <div style={{ marginBottom:16 }}><a onClick={onBack} style={{ color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13 }}>← 로그인으로 돌아가기</a></div>
      <div style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:20 }}>직원 회원가입</div>
      {err && <div style={{ background:'rgba(232,133,106,.15)', border:'1px solid rgba(232,133,106,.4)', borderRadius:'var(--radius-sm)', padding:'10px 14px', fontSize:13, color:'#f4a58a', marginBottom:12 }}>{err}</div>}
      <input style={inp} type="text" placeholder="아이디 (영문/숫자, 3자 이상)" value={rid} onChange={e=>setRid(e.target.value)}/>
      <input style={inp} type="password" placeholder="비밀번호 (6자 이상)" value={rpw} onChange={e=>setRpw(e.target.value)}/>
      <input style={inp} type="password" placeholder="비밀번호 확인" value={rpw2} onChange={e=>setRpw2(e.target.value)}/>
      <div style={{ fontSize:12, color:'rgba(255,255,255,.4)', marginBottom:8 }}>소속 매장</div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        {[{id:'dobong',label:'🏪 도봉점'},{id:'yangju',label:'🏪 양주점'}].map(s=>(
          <div key={s.id} onClick={()=>setStore(s.id)} style={{ flex:1, padding:12, border:`1.5px solid ${store===s.id?'var(--sage)':'rgba(255,255,255,.15)'}`, borderRadius:'var(--radius-sm)', cursor:'pointer', textAlign:'center', fontSize:14, color:store===s.id?'#fff':'rgba(255,255,255,.6)', background:store===s.id?'rgba(122,171,138,.2)':'transparent', transition:'all .18s' }}>{s.label}</div>
        ))}
      </div>
      <button onClick={submit} disabled={loading} style={{ width:'100%', padding:14, border:'none', borderRadius:'var(--radius-sm)', background:'linear-gradient(135deg,var(--coral),#d4704f)', color:'#fff', fontSize:15, fontWeight:700, fontFamily:'var(--font)', cursor:'pointer' }}>
        {loading ? '신청 중...' : '가입 신청'}
      </button>
      <div style={{ textAlign:'center', marginTop:12, fontSize:12, color:'rgba(255,255,255,.35)' }}>가입 후 마스터 승인 후 로그인 가능합니다</div>
    </>
  )
}

function SuccessView({ onLogin }) {
  return (
    <div style={{ textAlign:'center', padding:'20px 0' }}>
      <div style={{ fontSize:48, marginBottom:14 }}>✅</div>
      <div style={{ fontFamily:'var(--font-serif)', fontSize:18, fontWeight:700, color:'#fff', marginBottom:8 }}>가입 신청 완료!</div>
      <div style={{ fontSize:13, color:'rgba(255,255,255,.5)', lineHeight:1.7 }}>마스터 승인 후 로그인하실 수 있습니다.</div>
      <button onClick={onLogin} style={{ marginTop:24, width:'100%', padding:14, border:'none', borderRadius:'var(--radius-sm)', background:'linear-gradient(135deg,var(--sage),var(--sage-dark))', color:'#fff', fontSize:15, fontWeight:700, fontFamily:'var(--font)', cursor:'pointer' }}>로그인 화면으로</button>
    </div>
  )
}

// ── App Shell ──
const PAGES = {
  dashboard: { label:'대시보드', icon:'🏠' },
  list:      { label:'고객 목록', icon:'👥' },
  staff:     { label:'직원 관리', icon:'👤' },
}

function AppShell() {
  const { user, logout } = useAuth()
  const showToast = useToast()
  const [page, setPage] = useState('dashboard')
  const [listUrgency, setListUrgency] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [alertCount, setAlertCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [notifPerm, setNotifPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  )
  const isMaster = user.role === 'master'
  const visiblePages = Object.entries(PAGES).filter(([id]) => id !== 'staff' || isMaster)

  // ── counts ──
  const refreshCounts = useCallback(async () => {
    const { data: custs } = await supabase.from('customers').select('gifts').eq('deleted', false)
    let cnt = 0
    custs?.forEach(c => {
      const gifts = Array.isArray(c.gifts) ? c.gifts : []
      gifts.forEach(g => {
        if (!g.sent && g.date) {
          // daysUntil을 여기서 직접 계산 (import 순서 문제 방지)
          const [ty, tm, td] = g.date.split('-').map(Number)
          const targetMs = Date.UTC(ty, tm - 1, td)
          const now = new Date()
          const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
          const todayStr = kst.toISOString().split('T')[0]
          const [ny, nm, nd] = todayStr.split('-').map(Number)
          const todayMs = Date.UTC(ny, nm - 1, nd)
          const d = Math.round((targetMs - todayMs) / 86400000)
          if (d >= 0 && d <= 10) cnt++
        }
      })
    })
    setAlertCount(cnt)
    if (isMaster) {
      const { data: users } = await supabase.from('users').select('id').eq('approved', false).eq('active', true)
      setPendingCount(users?.length || 0)
    }
  }, [isMaster])

  // ── push subscription on mount ──
  useEffect(() => {
    refreshCounts()
    if (notifPerm === 'granted') {
      subscribePush(user.id).catch(console.error)
    }
  }, [user.id, notifPerm, refreshCounts])

  // ── 탭/앱 전환 후 돌아왔을 때 데이터 갱신 ──
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshCounts()
        setRefreshKey(k => k + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refreshCounts])

  // ── Realtime ──
  useEffect(() => {
    const custCh = supabase.channel(`cust-${user.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'customers' }, () => {
        refreshCounts()
        setRefreshKey(k => k + 1)
      })
      .subscribe()

    // users 테이블 변경 시: 약간의 지연 후 카운트 + 페이지 전체 갱신
    // 지연이 있어야 DB에서 삭제/변경이 완전히 반영된 뒤 조회됨
    let userTimer = null
    const userCh = supabase.channel(`user-${user.id}`)
      .on('postgres_changes', { event:'*', schema:'public', table:'users' }, () => {
        clearTimeout(userTimer)
        userTimer = setTimeout(() => {
          refreshCounts()
          setRefreshKey(k => k + 1)  // StaffManagement 등 하위 페이지도 새로고침
        }, 600)
      })
      .subscribe()

    return () => {
      clearTimeout(userTimer)
      supabase.removeChannel(custCh)
      supabase.removeChannel(userCh)
    }
  }, [user.id, isMaster, refreshCounts])

  // ── Pull to refresh ──
  const ptrRef = useRef({ startY:0, pulling:false })
  const [ptrShow, setPtrShow] = useState(false)
  const [ptrText, setPtrText] = useState('당겨서 새로고침')

  useEffect(() => {
    const threshold = 70
    const onStart = e => { if (window.scrollY === 0) ptrRef.current.startY = e.touches[0].clientY; else ptrRef.current.startY = 0 }
    const onMove  = e => {
      if (!ptrRef.current.startY) return
      const dist = e.touches[0].clientY - ptrRef.current.startY
      if (dist > 10) { ptrRef.current.pulling = true; setPtrShow(dist > 30); setPtrText(dist > threshold ? '놓으면 새로고침' : '당겨서 새로고침') }
    }
    const onEnd = async e => {
      if (!ptrRef.current.pulling) { ptrRef.current.startY = 0; return }
      const dist = e.changedTouches[0].clientY - ptrRef.current.startY
      ptrRef.current.pulling = false; ptrRef.current.startY = 0
      if (dist > threshold) {
        setPtrText('새로고침 중...')
        await refreshCounts()
        setRefreshKey(k => k + 1)
      }
      setTimeout(() => setPtrShow(false), 400)
    }
    const onCancel = () => { ptrRef.current.pulling = false; ptrRef.current.startY = 0; setPtrShow(false) }
    document.addEventListener('touchstart', onStart, { passive:true })
    document.addEventListener('touchmove',  onMove,  { passive:true })
    document.addEventListener('touchend',   onEnd,   { passive:true })
    document.addEventListener('touchcancel',onCancel,{ passive:true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
      document.removeEventListener('touchend',   onEnd)
      document.removeEventListener('touchcancel',onCancel)
    }
  }, [refreshCounts])

  // ── Notification button handlers ──
  const requestNotif = async () => {
    if (typeof Notification === 'undefined') return
    const p = await Notification.requestPermission()
    setNotifPerm(p)
    if (p === 'granted') {
      await subscribePush(user.id)
      showToast('알림이 활성화됐습니다', '🔔')
    }
  }

  const cancelNotif = async () => {
    await unsubscribePush(user.id)
    setNotifPerm('denied')
    showToast('알림이 해제됐습니다', '🔕')
  }

  const goPage = (p, urgency) => {
    if (p !== 'list') setListUrgency(null)
    if (urgency !== undefined) setListUrgency(urgency)
    setPage(p)
  }

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <div className={`ptr${ptrShow?' show':''}`}><div className="ptr-spin"/>{ptrText}</div>

      {/* Desktop Sidebar */}
      <nav style={{ width:220, minHeight:'100vh', background:'var(--dark)', display:'flex', flexDirection:'column', position:'fixed', top:0, left:0, zIndex:100 }} className="desktop-sidebar">
        <div style={{ padding:'22px 20px 16px', borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          <div style={{ fontFamily:'var(--font-serif)', fontSize:14, fontWeight:700, color:'#fff', lineHeight:1.4 }}>BABY HAÜS</div>
          <div style={{ marginTop:8, display:'flex', flexWrap:'wrap', gap:4 }}>
            <span className={`badge badge-${user.role}`}>{ROLE_LABEL[user.role]}</span>
            <span className={`badge badge-${user.store}`}>{STORE_LABEL[user.store]}</span>
            <span style={{ fontSize:12, color:'rgba(255,255,255,.6)', width:'100%', marginTop:2 }}>@{user.username}</span>
          </div>
        </div>
        <div style={{ padding:'14px 10px', flex:1 }}>
          {visiblePages.map(([id, { label, icon }]) => (
            <div key={id} onClick={() => goPage(id)} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:9, cursor:'pointer', fontSize:14, marginBottom:2, transition:'all .18s', background: page===id?'var(--sage)':'transparent', color: page===id?'#fff':'rgba(255,255,255,.6)', position:'relative' }}>
              <span style={{ fontSize:16, width:20, textAlign:'center' }}>{icon}</span>
              <span>{label}</span>
              {id==='dashboard' && alertCount>0 && <span style={{ marginLeft:'auto', background:'var(--coral)', color:'#fff', fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:600 }}>{alertCount}</span>}
              {id==='staff' && pendingCount>0 && <span style={{ marginLeft:'auto', background:'var(--gold)', color:'#fff', fontSize:10, padding:'2px 7px', borderRadius:20, fontWeight:600 }}>{pendingCount}</span>}
            </div>
          ))}
        </div>
        <div style={{ padding:'14px 12px', borderTop:'1px solid rgba(255,255,255,.08)', display:'flex', flexDirection:'column', gap:8 }}>
          <ChangePwdBtn showToast={showToast} user={user}/>
          <button onClick={logout} style={{ width:'100%', padding:10, border:'1px solid rgba(255,255,255,.15)', borderRadius:'var(--radius-sm)', background:'transparent', color:'rgba(255,255,255,.5)', cursor:'pointer', fontSize:13, fontFamily:'var(--font)' }}>🚪 로그아웃</button>
        </div>
      </nav>

      {/* Main */}
      <main style={{ marginLeft:220, flex:1, padding:28, paddingBottom:40, maxWidth:'calc(100vw - 220px)' }} className="admin-main">
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:22, flexWrap:'wrap', gap:12 }}>
          <div>
            <div style={{ fontFamily:'var(--font-serif)', fontSize:22, fontWeight:700 }}>{PAGES[page]?.label}</div>
            <div style={{ fontSize:13, color:'var(--mid)', marginTop:3 }}>{new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric',weekday:'short'})} · {ROLE_LABEL[user.role]} @{user.username}</div>
          </div>
          <NotifBtn notifPerm={notifPerm} onRequest={requestNotif} onCancel={cancelNotif}/>
        </div>
        {page==='dashboard' && <Dashboard key={`dash-${refreshKey}`} onGoList={(u) => goPage('list', u||null)} user={user}/>}
        {page==='list'      && <CustomerList key={`list-${refreshKey}`} user={user} showToast={showToast} initialUrgency={listUrgency}/>}
        {page==='staff'     && isMaster && <StaffManagement key={`staff-${refreshKey}`} showToast={showToast} onRefresh={refreshCounts}/>}
      </main>

      {/* Mobile Bottom Nav */}
      <nav style={{ display:'none', position:'fixed', bottom:0, left:0, right:0, background:'var(--dark)', zIndex:100, borderTop:'1px solid rgba(255,255,255,.08)', padding:'4px 0 8px' }} className="mobile-nav">
        <div style={{ display:'flex' }}>
          {visiblePages.map(([id, { label, icon }]) => (
            <div key={id} onClick={() => goPage(id)} style={{ flex:1, textAlign:'center', padding:'8px 4px 4px', cursor:'pointer', color: page===id?'var(--sage)':'rgba(255,255,255,.5)', position:'relative' }}>
              <span style={{ fontSize:20, display:'block', marginBottom:2 }}>{icon}</span>
              {id==='dashboard' && alertCount>0 && <span style={{ position:'absolute', top:4, right:'10%', background:'var(--coral)', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:20 }}>{alertCount}</span>}
              {id==='staff' && pendingCount>0 && <span style={{ position:'absolute', top:4, right:'10%', background:'var(--gold)', color:'#fff', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:20 }}>{pendingCount}</span>}
              <span style={{ fontSize:10 }}>{label}</span>
            </div>
          ))}
          <div onClick={() => setPage('_more')} style={{ flex:1, textAlign:'center', padding:'8px 4px 4px', cursor:'pointer', color:'rgba(255,255,255,.5)' }}>
            <span style={{ fontSize:20, display:'block', marginBottom:2 }}>⚙️</span>
            <span style={{ fontSize:10 }}>더보기</span>
          </div>
        </div>
      </nav>

      {/* Mobile More Modal */}
      {page==='_more' && (
        <div className="overlay" onClick={() => setPage('dashboard')}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">⚙️ 더보기</div>
            <div style={{ padding:'12px 0', borderBottom:'1px solid var(--cream2)', fontSize:13, color:'var(--mid)', marginBottom:12 }}>
              <span className={`badge badge-${user.role}`}>{ROLE_LABEL[user.role]}</span> <span className={`badge badge-${user.store}`}>{STORE_LABEL[user.store]}</span>
              <div style={{ fontWeight:600, color:'var(--dark)', marginTop:4 }}>@{user.username}</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div><NotifBtn notifPerm={notifPerm} onRequest={requestNotif} onCancel={cancelNotif}/></div>
              <ChangePwdBtn showToast={showToast} user={user}/>
              <button className="btn btn-danger" style={{ width:'100%', padding:13 }} onClick={logout}>🚪 로그아웃</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media(max-width:768px){
          .desktop-sidebar{display:none!important;}
          .admin-main{margin-left:0!important;padding:14px 12px 90px!important;max-width:100vw!important;}
          .mobile-nav{display:block!important;}
        }
      `}</style>
    </div>
  )
}

function NotifBtn({ notifPerm, onRequest, onCancel }) {
  if (typeof Notification === 'undefined') return null
  if (notifPerm === 'granted') return (
    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ padding:'9px 16px', border:'2px solid var(--sage)', borderRadius:'var(--radius-sm)', background:'var(--sage-light)', color:'var(--sage-dark)', fontSize:13 }}>🔔 알림 켜짐</div>
      <button className="btn btn-secondary btn-sm" onClick={onCancel}>해제</button>
    </div>
  )
  return <button className="btn btn-secondary" onClick={onRequest}>🔔 알림 허용</button>
}

function ChangePwdBtn({ showToast, user }) {
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [nw2, setNw2] = useState('')
  const [err, setErr] = useState('')

  const submit = async () => {
    if (!cur||!nw||!nw2) { setErr('모든 항목을 입력해주세요.'); return }
    if (user.pwd !== hashPwd(cur)) { setErr('현재 비밀번호가 올바르지 않습니다.'); return }
    if (nw.length < 6) { setErr('새 비밀번호는 6자 이상이어야 합니다.'); return }
    if (nw !== nw2) { setErr('새 비밀번호가 일치하지 않습니다.'); return }
    await supabase.from('users').update({ pwd: hashPwd(nw) }).eq('id', user.id)
    const saved = getSavedCreds()
    if (saved.username === user.username) localStorage.setItem('bss_saved_creds', JSON.stringify({ username:user.username, password:nw }))
    setOpen(false); setCur(''); setNw(''); setNw2(''); setErr('')
    showToast('비밀번호가 변경됐습니다', '🔑')
  }

  return (
    <>
      <button onClick={()=>setOpen(true)} style={{ width:'100%', padding:10, border:'1px solid rgba(255,255,255,.15)', borderRadius:'var(--radius-sm)', background:'transparent', color:'rgba(255,255,255,.6)', cursor:'pointer', fontSize:13, fontFamily:'var(--font)' }}>🔑 비밀번호 변경</button>
      {open && (
        <div className="overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <div className="modal-title">🔑 비밀번호 변경</div>
            {err && <div className="warn-box">{err}</div>}
            <div className="form-group"><label className="form-label">현재 비밀번호</label><input className="form-input" type="password" value={cur} onChange={e=>setCur(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">새 비밀번호 (6자 이상)</label><input className="form-input" type="password" value={nw} onChange={e=>setNw(e.target.value)}/></div>
            <div className="form-group"><label className="form-label">새 비밀번호 확인</label><input className="form-input" type="password" value={nw2} onChange={e=>setNw2(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}/></div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={()=>setOpen(false)}>취소</button>
              <button className="btn btn-primary" onClick={submit}>변경 완료</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
