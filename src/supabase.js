import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://bbitqqtibpkzoijgvylo.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJiaXRxcXRpYnBrem9pamd2eWxvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzMzYzOTQsImV4cCI6MjA4OTkxMjM5NH0.MXoSMJCv7KmCt57KHVCOTRBIwbr8r-f8VBKlHE7v6pc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
