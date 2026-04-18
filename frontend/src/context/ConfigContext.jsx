import { createContext, useContext, useEffect, useState } from 'react'
import { getConfig } from '../services/api'
import defaults from '../config/appConfig'

const ConfigContext = createContext({ ...defaults, updateConfig: () => {} })

export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(defaults)

  useEffect(() => {
    getConfig()
      .then(remote => setConfig(prev => ({ ...prev, ...remote })))
      .catch(() => {/* keep defaults on network failure */})
  }, [])

  /** Instantly update one config key in local state (call after a successful PUT /api/config) */
  function updateConfig(key, value) {
    setConfig(prev => ({ ...prev, [key]: value }))
  }

  return (
    <ConfigContext.Provider value={{ ...config, updateConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

/** Returns the full app config — always has values (defaults until API responds) */
export function useConfig() {
  return useContext(ConfigContext)
}
