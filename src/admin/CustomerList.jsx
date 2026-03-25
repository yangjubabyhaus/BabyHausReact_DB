import React, { useState, useEffect, useCallback } from 'react'
import { supabase } from '../supabase'
import { fmtDate, daysUntil, effDate, effType, getGifts, can, STORE_LABEL } from '../utils'
import CustomerDetail from './CustomerDetail'

export default function CustomerList({ user, showToast, initialUrgency }) {
  const [custs, setCusts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sq, setSq] = useState('')
  const [sf, setSf] = useState('all')
  const [tf, setTf] = useState('all')
  const [urgency, setUrgency] = useState(initialUrgency || null)
  const [detailId, setDetailId] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)

  // 화면 크기 변경 감지
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const load = useCallback(async () => {
    let q = supabase.from('customers').select('*').eq('deleted', false)
    if (!can(user.role, 'viewAll')) q = q.eq('store', user.store)
    const { data } = await q
    setCusts(data || [])
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const canSee = (c) => can(user.role, 'viewAll') || c.store === user.store
    const ch = supabase.channel(`custlist-${user.id}`)
      .on('postgres_changes', { event:'INSERT', schema:'public', table:'customers' }, (payload) => {
        const c = payload.new
        if (!c || c.deleted || !canSee(c)) return
        setCusts(prev => prev.find(x => x.id === c.id) ? prev : [...prev, c])
      })
      .on('postgres_changes', { event:'UPDATE', schema:'public', table:'customers' }, (payload) => {
        const c = payload.new
        if (!c) return
        if (c.deleted) {
          setCusts(prev => prev.filter(x => x.id !== c.id))
        } else {
          setCusts(prev => {
            const exists = prev.find(x => x.id === c.id)
            if (exists) return prev.map(x => x.id === c.id ? c : x)
            if (canSee(c)) return [...prev, c]
            return prev
          })
        }
      })
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [user])

  const filtered = custs.filter(c => {
    const q = sq.toLowerCase()
    const m = !q || c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || (c.childName||'').toLowerCase().includes(q)
    const sm = sf === 'all' || c.store === sf
    const tm = tf === 'all' || effType(c) === tf
    if (!m || !sm || !tm) return false
    if (!urgency) return true

    // urgency 필터: '10' → D-0~10, '30' → D-11~30, 'overdue' → 지난 미발송
    const gifts = getGifts(c)
    if (urgency === '10') {
      return gifts.some(g => {
        if (g.sent || !g.date) return false
        const d = daysUntil(g.date)
        return d !== null && d >= 0 && d <= 10
      })
    } else if (urgency === '30') {
      return gifts.some(g => {
        if (g.sent || !g.date) return false
        const d = daysUntil(g.date)
        return d !== null && d >= 11 && d <= 30
      })
    } else if (urgency === 'overdue') {
      return gifts.some(g => {
        if (g.sent || !g.date) return false
        const d = daysUntil(g.date)
        return d !== null && d < 0
      })
    }
    return true
  })

  const exportCSV = () => {
    const hdr = ['매장','유형','고객명','연락처','주소','아이이름','기준일','등록일','다음선물일','다음선물명']
    const rows = filtered.map(c => {
      const next = getGifts(c).find(g => !g.sent && daysUntil(g.date) >= 0)
      return [STORE_LABEL[c.store]||'', c.type==='pregnant'?'임산부':'일반', c.name, c.phone||'', c.address||'', c.childName||'', effDate(c)||'', c.registeredAt||'', next?next.date:'완료', next?next.label:'']
    })
    const csv = '\uFEFF' + [hdr,...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})), download:`고객목록_${new Date().toISOString().split('T')[0]}.csv` })
    a.click()
    showToast('엑셀 다운로드 완료', '📥')
  }

  const urgencyLabel = urgency === '10' ? '🚨 10일 내' : urgency === '30' ? '🎁 11~30일' : urgency === 'overdue' ? '⚠️ 기한 지남' : null

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'var(--light)' }}>불러오는 중...</div>

  return (
    <>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4, flexWrap:'wrap', gap:8 }}>
        <div style={{ fontSize:13, color:'var(--mid)' }}>
          총 {filtered.length}명
          {urgencyLabel && <span style={{ color:'var(--coral)', fontWeight:600 }}> · {urgencyLabel}</span>}
        </div>
        {urgencyLabel && <button className="btn btn-secondary btn-sm" onClick={() => setUrgency(null)}>✕ 필터 해제</button>}
      </div>

      <div className="card">
        <div style={{ display:'flex', gap:9, marginBottom:14, flexWrap:'wrap' }}>
          <input style={{ flex:1, minWidth:140, padding:'9px 13px', border:'1.5px solid #e8e0d5', borderRadius:'var(--radius-sm)', fontSize:13, fontFamily:'var(--font)', background:'var(--cream)', outline:'none' }}
            placeholder="이름, 연락처, 아이 이름..." value={sq} onChange={e => setSq(e.target.value)}/>
          {can(user.role,'viewAll') && (
            <select className="form-select" value={sf} onChange={e => setSf(e.target.value)}>
              <option value="all">전체 매장</option>
              <option value="dobong">도봉점</option>
              <option value="yangju">양주점</option>
            </select>
          )}
          <select className="form-select" value={tf} onChange={e => setTf(e.target.value)}>
            <option value="all">전체 유형</option>
            <option value="pregnant">임산부</option>
            <option value="normal">일반</option>
          </select>
          <select className="form-select" value={urgency||''} onChange={e => setUrgency(e.target.value||null)}>
            <option value="">전체 일정</option>
            <option value="overdue">⚠️ 기한 지남</option>
            <option value="10">🚨 10일 내</option>
            <option value="30">🎁 11~30일</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={exportCSV}>📥 엑셀</button>
        </div>

        {filtered.length === 0
          ? <div className="empty">🔍 검색 결과가 없습니다</div>
          : isMobile
            ? filtered.map(c => <MobileCard key={c.id} c={c} onClick={() => setDetailId(c.id)}/>)
            : <DesktopTable custs={filtered} onDetail={id => setDetailId(id)}/>
        }
      </div>

      {detailId && <CustomerDetail id={detailId} onClose={() => { setDetailId(null); load() }} showToast={showToast}/>}
    </>
  )
}

function MobileCard({ c, onClick }) {
  const gifts = getGifts(c)
  // 다음 발송: 미발송 중 가장 가까운 미래 선물
  const upcoming = gifts
    .filter(g => !g.sent && g.date)
    .map(g => ({ ...g, d: daysUntil(g.date) }))
    .filter(g => g.d !== null)
    .sort((a, b) => a.d - b.d)
  const next = upcoming.find(g => g.d >= 0) || upcoming[0] // 미래가 없으면 가장 최근 과거

  const nd = next ? next.d : null
  let ddCls='dd-green', ddTxt
  if (nd === null) { ddTxt = '완료' }
  else if (nd < 0) { ddCls='dd-red'; ddTxt=`D+${Math.abs(nd)}` }
  else if (nd === 0) { ddCls='dd-red'; ddTxt='오늘!' }
  else { ddTxt = 'D-' + nd }

  if (nd !== null && nd > 0 && nd <= 3) ddCls='dd-red'
  else if (nd !== null && nd > 3 && nd <= 7) ddCls='dd-gold'

  return (
    <div className="cust-card" onClick={onClick}>
      <div className="cc-top">
        <div className="cc-left">
          <div className="cc-name">{c.name} <span style={{ fontWeight:400, color:'var(--mid)' }}>· {c.childName||'-'}</span></div>
          <div className="cc-meta">
            <span className={`badge badge-${c.store}`}>{STORE_LABEL[c.store]||c.store}</span>
            <span className={`badge badge-${effType(c)}`}>{effType(c)==='pregnant'?'🤰 임산부':'👶 일반'}</span>
          </div>
        </div>
        {nd !== null && <span className={`dday ${ddCls}`}>{ddTxt}</span>}
      </div>
      <div className="cc-row"><span className="cc-key">연락처</span><span className="cc-val">{c.phone||'-'}</span></div>
      <div className="cc-row"><span className="cc-key">생일/예정일</span><span className="cc-val">{fmtDate(effDate(c))}</span></div>
      {next && <div className="cc-row"><span className="cc-key">다음 선물</span><span className="cc-val" style={{ color: nd < 0 ? 'var(--coral)' : 'var(--sage-dark)' }}>{next.label}</span></div>}
    </div>
  )
}

function DesktopTable({ custs, onDetail }) {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>매장</th><th>유형</th><th>고객명</th><th>아이</th><th>연락처</th><th>생일/예정일</th><th>다음 발송</th><th></th></tr></thead>
        <tbody>
          {custs.map(c => {
            const gifts = getGifts(c)
            const upcoming = gifts
              .filter(g => !g.sent && g.date)
              .map(g => ({ ...g, d: daysUntil(g.date) }))
              .filter(g => g.d !== null)
              .sort((a, b) => a.d - b.d)
            const next = upcoming.find(g => g.d >= 0) || upcoming[0]
            const nd = next ? next.d : null
            return (
              <tr key={c.id}>
                <td><span className={`badge badge-${c.store}`}>{STORE_LABEL[c.store]||c.store}</span></td>
                <td><span className={`badge badge-${effType(c)}`}>{effType(c)==='pregnant'?'🤰 임산부':'👶 일반'}</span></td>
                <td><strong>{c.name}</strong></td>
                <td>{c.childName||'-'}</td>
                <td>{c.phone||'-'}</td>
                <td>{fmtDate(effDate(c))}</td>
                <td>{next
                  ? <><span className="badge badge-soon">{nd < 0 ? `D+${Math.abs(nd)}` : nd===0 ? '오늘!' : 'D-'+nd}</span><br/><span style={{fontSize:11,color:'var(--mid)'}}>{next.label}</span></>
                  : <span style={{fontSize:11,color:'var(--light)'}}>완료</span>
                }</td>
                <td><button className="btn btn-secondary btn-sm" onClick={() => onDetail(c.id)}>상세</button></td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
