import React, { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../supabase'
import { today, fmtDate, STORE_LABEL, ROLE_LABEL } from '../utils'

function PendRow({ u, isMobile, onModal }) {
  if (isMobile) return (
    <div className="staff-card">
      <div className="sc-head">
        <div>
          <div className="sc-name">@{u.username}</div>
          <div style={{ marginTop:5 }}><span className={`badge badge-${u.store}`}>{STORE_LABEL[u.store]||u.store}</span></div>
        </div>
        <div style={{ fontSize:11, color:'var(--light)' }}>{fmtDate(u.createdAt)}</div>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <button className="btn btn-primary" style={{ flex:1, padding:11 }} onClick={() => onModal({ type:'approve', user:u })}>✅ 승인</button>
        <button className="btn btn-danger"  style={{ flex:1, padding:11 }} onClick={() => onModal({ type:'reject',  user:u })}>✗ 거절</button>
      </div>
    </div>
  )
  return (
    <tr>
      <td><strong>{u.username}</strong></td>
      <td><span className={`badge badge-${u.store}`}>{STORE_LABEL[u.store]||u.store}</span></td>
      <td>{fmtDate(u.createdAt)}</td>
      <td style={{ display:'flex', gap:6 }}>
        <button className="btn btn-sm btn-primary" onClick={() => onModal({ type:'approve', user:u })}>✅ 승인</button>
        <button className="btn btn-sm btn-danger"  onClick={() => onModal({ type:'reject',  user:u })}>✗ 거절</button>
      </td>
    </tr>
  )
}

function ActiveRow({ u, isMobile, onModal }) {
  if (isMobile) return (
    <div className="staff-card">
      <div className="sc-head">
        <div>
          <div className="sc-name">@{u.username}</div>
          <div style={{ marginTop:5, display:'flex', gap:5, flexWrap:'wrap' }}>
            <span className={`badge badge-${u.role}`}>{ROLE_LABEL[u.role]}</span>
            <span className={`badge badge-${u.store}`}>{STORE_LABEL[u.store]||u.store}</span>
          </div>
        </div>
        <div style={{ fontSize:11, color:'var(--light)' }}>{fmtDate(u.createdAt)}</div>
      </div>
      <div style={{ display:'flex', gap:8, marginTop:12 }}>
        <button className="btn btn-secondary" style={{ flex:1, padding:11 }} onClick={() => onModal({ type:'update',     user:u })}>⚙️ 권한 변경</button>
        <button className="btn btn-danger"    style={{ flex:1, padding:11 }} onClick={() => onModal({ type:'deactivate', user:u })}>비활성화</button>
      </div>
    </div>
  )
  return (
    <tr>
      <td><strong>{u.username}</strong></td>
      <td><span className={`badge badge-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
      <td><span className={`badge badge-${u.store}`}>{STORE_LABEL[u.store]||u.store}</span></td>
      <td>{fmtDate(u.createdAt)}</td>
      <td>
        <button className="btn btn-sm btn-secondary" onClick={() => onModal({ type:'update',     user:u })}>⚙️ 변경</button>{' '}
        <button className="btn btn-sm btn-danger"    onClick={() => onModal({ type:'deactivate', user:u })}>비활성화</button>
      </td>
    </tr>
  )
}

export default function StaffManagement({ showToast, onRefresh }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  // 내가 직접 변경한 직후에는 Realtime의 재조회를 무시하기 위한 ref
  const skipReload = useRef(false)

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const load = useCallback(async () => {
    const { data } = await supabase.from('users').select('*').order('createdAt', { ascending: false })
    setUsers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Realtime: 외부 변경(다른 기기에서의 변경, 새 직원 가입 등)만 반영
  // 내가 직접 변경한 경우 skipReload로 무시
  // DB 반영 시간을 고려해 약간 지연 후 재조회
  useEffect(() => {
    let reloadTimer = null
    const ch = supabase.channel('staff-changes-' + Date.now())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          if (skipReload.current) {
            skipReload.current = false
            return
          }
          clearTimeout(reloadTimer)
          reloadTimer = setTimeout(() => load(), 400)
        }
      )
      .subscribe()
    return () => {
      clearTimeout(reloadTimer)
      supabase.removeChannel(ch)
    }
  }, [load])

  const pending = users.filter(u => !u.approved && u.active)
  const active  = users.filter(u =>  u.approved && u.active && u.role !== 'master')

  const approve = async (uid, role, store) => {
    const { error } = await supabase.from('users').update({
      approved: true,
      role,
      store: role === 'manager' ? 'all' : store
    }).eq('id', uid)

    if (error) { showToast('오류가 발생했습니다', '❌'); return }

    skipReload.current = true
    setUsers(prev => prev.map(u =>
      u.id === uid ? { ...u, approved: true, role, store: role === 'manager' ? 'all' : store } : u
    ))
    setModal(null)
    showToast('승인 완료!', '✅')
    onRefresh()
  }

  const reject = async (uid) => {
    const { error } = await supabase.from('users').delete().eq('id', uid)

    if (error) { showToast('오류가 발생했습니다', '❌'); return }

    skipReload.current = true
    setUsers(prev => prev.filter(u => u.id !== uid))
    setModal(null)
    showToast('가입이 거절됐습니다', '✗')
    onRefresh()
  }

  const update = async (uid, role, store) => {
    const { error } = await supabase.from('users').update({
      role,
      store: role === 'manager' ? 'all' : store
    }).eq('id', uid)

    if (error) { showToast('오류가 발생했습니다', '❌'); return }

    skipReload.current = true
    setUsers(prev => prev.map(u =>
      u.id === uid ? { ...u, role, store: role === 'manager' ? 'all' : store } : u
    ))
    setModal(null)
    showToast('권한이 변경됐습니다', '✅')
  }

  const deactivate = async (uid) => {
    const { error } = await supabase.from('users').update({ active: false }).eq('id', uid)

    if (error) { showToast('오류가 발생했습니다', '❌'); return }

    skipReload.current = true
    setUsers(prev => prev.filter(u => u.id !== uid))
    setModal(null)
    showToast('계정이 비활성화됐습니다', '🚫')
    onRefresh()
  }

  if (loading) return <div style={{ textAlign:'center', padding:60, color:'var(--light)' }}>불러오는 중...</div>

  return (
    <>
      {pending.length > 0 && (
        <div className="card" style={{ borderTop:'3px solid var(--coral)', marginBottom:20 }}>
          <div className="sec-title" style={{ color:'var(--coral)' }}>🔔 승인 대기 ({pending.length}명)</div>
          {isMobile
            ? pending.map(u => <PendRow key={u.id} u={u} isMobile={isMobile} onModal={setModal}/>)
            : <div className="table-wrap"><table>
                <thead><tr><th>아이디</th><th>신청 매장</th><th>가입일</th><th>처리</th></tr></thead>
                <tbody>{pending.map(u => <PendRow key={u.id} u={u} isMobile={isMobile} onModal={setModal}/>)}</tbody>
              </table></div>
          }
        </div>
      )}

      <div className="card">
        <div className="sec-title">👥 전체 직원 ({active.length}명)</div>
        {active.length === 0
          ? <div className="empty" style={{textAlign:'center',padding:20,color:'var(--light)',fontSize:13}}>등록된 직원이 없습니다</div>
          : isMobile
            ? active.map(u => <ActiveRow key={u.id} u={u} isMobile={isMobile} onModal={setModal}/>)
            : <div className="table-wrap"><table>
                <thead><tr><th>아이디</th><th>역할</th><th>매장</th><th>가입일</th><th>관리</th></tr></thead>
                <tbody>{active.map(u => <ActiveRow key={u.id} u={u} isMobile={isMobile} onModal={setModal}/>)}</tbody>
              </table></div>
        }
      </div>

      {/* Modals */}
      {modal?.type === 'approve' && (
        <ApproveModal u={modal.user} onApprove={approve} onClose={() => setModal(null)}/>
      )}
      {modal?.type === 'update' && (
        <UpdateModal u={modal.user} onUpdate={update} onClose={() => setModal(null)}/>
      )}
      {modal?.type === 'reject' && (
        <ConfirmModal
          title="✗ 가입 거절"
          msg={<>@<strong>{modal.user.username}</strong> 의 가입을 거절하시겠습니까?<br/><span style={{fontSize:12,color:'var(--mid)'}}>거절 시 계정이 삭제됩니다.</span></>}
          confirmLabel="거절 확인"
          onConfirm={() => reject(modal.user.id)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === 'deactivate' && (
        <ConfirmModal
          title="🚫 계정 비활성화"
          msg={<>@<strong>{modal.user.username}</strong> 계정을 비활성화하시겠습니까?<br/><span style={{fontSize:12,color:'var(--mid)'}}>해당 직원은 로그인이 불가능해집니다.</span></>}
          confirmLabel="비활성화"
          onConfirm={() => deactivate(modal.user.id)}
          onClose={() => setModal(null)}
        />
      )}
    </>
  )
}

function ConfirmModal({ title, msg, confirmLabel, onConfirm, onClose }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div style={{ fontSize:14, marginBottom:20, lineHeight:1.7 }}>{msg}</div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-coral" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}

function RoleStoreSelector({ role, store, onRole, onStore }) {
  return (
    <>
      <div style={{ marginBottom:10, fontWeight:600, fontSize:13 }}>역할 선택</div>
      <div style={{ display:'flex', gap:12, marginBottom:16 }}>
        {[
          { id:'manager', icon:'⭐', name:'매니저', desc:'전체 열람 + 발송 처리' },
          { id:'staff',   icon:'👤', name:'직원',   desc:'담당 매장 · 읽기 전용' }
        ].map(r => (
          <div key={r.id} onClick={() => { onRole(r.id); if(r.id==='manager') onStore('all') }} style={{
            flex:1, padding:'12px 8px', border:`2px solid ${role===r.id?(r.id==='manager'?'var(--gold)':'var(--sage)'):'var(--cream2)'}`,
            borderRadius:'var(--radius-sm)', cursor:'pointer', textAlign:'center',
            background: role===r.id?(r.id==='manager'?'var(--gold-light)':'var(--sage-light)'):'var(--cream)',
            transition:'all .18s'
          }}>
            <div style={{ fontSize:22, marginBottom:5 }}>{r.icon}</div>
            <div style={{ fontWeight:700, fontSize:13 }}>{r.name}</div>
            <div style={{ fontSize:11, color:'var(--mid)', marginTop:3 }}>{r.desc}</div>
          </div>
        ))}
      </div>
      {role === 'staff' && (
        <>
          <div style={{ marginBottom:8, fontWeight:600, fontSize:13 }}>담당 매장</div>
          <div style={{ display:'flex', gap:10, marginBottom:16 }}>
            {[{id:'dobong',label:'🏪 도봉점'},{id:'yangju',label:'🏪 양주점'}].map(s => (
              <div key={s.id} onClick={() => onStore(s.id)} style={{
                flex:1, padding:10, border:`2px solid ${store===s.id?'var(--sage)':'var(--cream2)'}`,
                borderRadius:'var(--radius-sm)', cursor:'pointer', textAlign:'center', fontSize:13, fontWeight:600,
                background: store===s.id?'var(--sage-light)':'var(--cream)', transition:'all .18s'
              }}>{s.label}</div>
            ))}
          </div>
        </>
      )}
      {role === 'manager' && <div className="info-box">매니저는 전체 매장 열람 권한을 가집니다.</div>}
    </>
  )
}

function ApproveModal({ u, onApprove, onClose }) {
  const [role, setRole] = useState('staff')
  const [store, setStore] = useState(u.store || 'dobong')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">✅ 직원 승인</div>
        <div style={{ fontSize:14, color:'var(--mid)', marginBottom:16 }}>
          @{u.username} · <span className={`badge badge-${u.store}`}>{STORE_LABEL[u.store]||u.store}</span>
        </div>
        <RoleStoreSelector role={role} store={store} onRole={setRole} onStore={setStore}/>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onApprove(u.id, role, store)}>승인 완료</button>
        </div>
      </div>
    </div>
  )
}

function UpdateModal({ u, onUpdate, onClose }) {
  const [role, setRole] = useState(u.role || 'staff')
  const [store, setStore] = useState(u.store || 'dobong')
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-title">⚙️ 권한 변경</div>
        <div style={{ fontSize:14, color:'var(--mid)', marginBottom:16 }}>@{u.username}</div>
        <RoleStoreSelector role={role} store={store} onRole={setRole} onStore={setStore}/>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>취소</button>
          <button className="btn btn-primary" onClick={() => onUpdate(u.id, role, store)}>변경 완료</button>
        </div>
      </div>
    </div>
  )
}
