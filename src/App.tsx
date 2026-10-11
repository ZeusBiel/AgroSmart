import type { LucideIcon } from 'lucide-react'
import { Cpu, Database, LayoutDashboard, Pause, Play, Power, RotateCcw, Sprout } from 'lucide-react'
import { useState } from 'react'
import './App.css'
import { Segmented } from './components/ui'
import { farm, plots } from './domain/farm'
import { formatDateTime } from './lib/format'
import { SPEEDS, usePlatform } from './platform/usePlatform'
import { AutomationScreen } from './screens/AutomationScreen'
import { DataScreen } from './screens/DataScreen'
import { LoginScreen } from './screens/LoginScreen'
import { OverviewScreen } from './screens/OverviewScreen'
import { PlotsScreen } from './screens/PlotsScreen'

type Screen = 'overview' | 'plots' | 'automation' | 'data'

const navigationItems: Array<{ id: Screen; label: string; icon: LucideIcon }> = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'plots', label: 'Talhões', icon: Sprout },
  { id: 'automation', label: 'Automação', icon: Cpu },
  { id: 'data', label: 'Dados', icon: Database },
]

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  if (!isAuthenticated) {
    return <LoginScreen onLogin={() => setIsAuthenticated(true)} />
  }

  return <Platform onLogout={() => setIsAuthenticated(false)} />
}

function Platform({ onLogout }: { onLogout: () => void }) {
  const { state, dispatch, running, setRunning, speed, setSpeed } = usePlatform()
  const [activeScreen, setActiveScreen] = useState<Screen>('overview')
  const [selectedPlotId, setSelectedPlotId] = useState(plots[0].id)

  function openPlot(plotId: string) {
    setSelectedPlotId(plotId)
    setActiveScreen('plots')
    window.scrollTo({ top: 0 })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">AgroSmart · Fase 6</p>
          <h1>{farm.name}</h1>
          <p className="operator-line">
            {farm.location} · <span className="sim-clock">{formatDateTime(state.time)}</span>
            {running ? ' · ao vivo (simulado)' : ' · pausado'}
          </p>
        </div>
        <div className="topbar-actions">
          <div className="sim-controls">
            <button
              className="icon-button"
              type="button"
              onClick={() => setRunning(!running)}
              aria-label={running ? 'Pausar simulação' : 'Retomar simulação'}
            >
              {running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            </button>
            <Segmented
              label="Velocidade da simulação"
              value={speed}
              onChange={setSpeed}
              options={SPEEDS.map((option) => ({ value: option.ticks, label: option.label }))}
            />
            <button
              className="icon-button"
              type="button"
              onClick={() => dispatch({ type: 'reset' })}
              aria-label="Reiniciar simulação com novo cenário"
              title="Reiniciar simulação"
            >
              <RotateCcw aria-hidden="true" />
            </button>
          </div>
          <button className="icon-button" type="button" onClick={onLogout}>
            <Power aria-hidden="true" />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {activeScreen === 'overview' && <OverviewScreen state={state} onOpenPlot={openPlot} />}
      {activeScreen === 'plots' && (
        <PlotsScreen state={state} plotId={selectedPlotId} onSelectPlot={setSelectedPlotId} />
      )}
      {activeScreen === 'automation' && <AutomationScreen state={state} dispatch={dispatch} />}
      {activeScreen === 'data' && <DataScreen state={state} />}

      <nav className="bottom-nav" aria-label="Navegação principal">
        {navigationItems.map((item) => (
          <button
            aria-current={activeScreen === item.id ? 'page' : undefined}
            className={activeScreen === item.id ? 'nav-item active' : 'nav-item'}
            key={item.id}
            onClick={() => setActiveScreen(item.id)}
            type="button"
          >
            <item.icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </main>
  )
}

export default App
