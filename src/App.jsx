import React from 'react'
import CustomerRegister from './CustomerRegister'
import AdminApp from './admin/AdminApp'

export default function App() {
  const path = window.location.pathname
  if (path.startsWith('/admin')) return <AdminApp />
  return <CustomerRegister />
}
