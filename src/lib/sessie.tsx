import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Rol } from './supabase'

type Profiel = { id: string; naam: string | null; email: string | null; globale_rol: Rol | null }

type SessieStaat = {
  laden: boolean
  sessie: Session | null
  profiel: Profiel | null
  // Beheer/onderhoudsmanager moet nog tweestapsverificatie doen (alleen als mfa_verplicht aan staat).
  tweestapsNodig: boolean
  verversen: () => Promise<void>
}

const SessieContext = createContext<SessieStaat | null>(null)

export function SessieProvider({ children }: { children: ReactNode }) {
  const [sessie, setSessie] = useState<Session | null>(null)
  const [profiel, setProfiel] = useState<Profiel | null>(null)
  const [tweestapsNodig, setTweestapsNodig] = useState(false)
  const [laden, setLaden] = useState(true)

  async function laadProfiel(s: Session | null) {
    if (!s) {
      setProfiel(null)
      setTweestapsNodig(false)
      setLaden(false)
      return
    }
    const [{ data: p }, { data: mfa }, { data: aal }] = await Promise.all([
      supabase.from('profielen').select('id, naam, email, globale_rol').eq('id', s.user.id).single(),
      supabase.from('instellingen').select('waarde').eq('sleutel', 'mfa_verplicht').maybeSingle(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ])
    setProfiel(p)
    setTweestapsNodig(Boolean(p?.globale_rol && mfa?.waarde === true && aal?.currentLevel !== 'aal2'))
    setLaden(false)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSessie(data.session)
      laadProfiel(data.session)
    })
    const { data } = supabase.auth.onAuthStateChange((_gebeurtenis, s) => {
      setSessie(s)
      // Niet direct awaiten binnen de callback (Supabase-advies); daarom via setTimeout.
      setTimeout(() => laadProfiel(s), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const verversen = async () => {
    const { data } = await supabase.auth.refreshSession()
    setSessie(data.session)
    await laadProfiel(data.session)
  }

  return (
    <SessieContext.Provider value={{ laden, sessie, profiel, tweestapsNodig, verversen }}>
      {children}
    </SessieContext.Provider>
  )
}

export function useSessie() {
  const s = useContext(SessieContext)
  if (!s) throw new Error('useSessie buiten SessieProvider')
  return s
}
