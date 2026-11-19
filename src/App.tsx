import { useEffect } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { AutoTacticsModal } from './components/AutoTacticsModal';
import { BattleScreen } from './components/BattleScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HangarScreen } from './components/HangarScreen';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { useGameStore } from './store/useGameStore';

function AppShell() {
  const screen = useGameStore((s) => s.screen);
  const adminPanelOpen = useGameStore((s) => s.adminPanelOpen);
  const tacticsModalOpen = useGameStore((s) => s.tacticsModalOpen);
  const toggleAdminPanel = useGameStore((s) => s.toggleAdminPanel);
  const setAdminPanelOpen = useGameStore((s) => s.setAdminPanelOpen);
  const setTacticsModalOpen = useGameStore((s) => s.setTacticsModalOpen);
  const startBattle = useGameStore((s) => s.startBattle);
  const battleSectorId = useGameStore((s) => s.battle?.sectorId);

  // Global Admin CP activation: Ctrl+Shift+A or ?admin=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === '1') {
      setAdminPanelOpen(true);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        toggleAdminPanel();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setAdminPanelOpen, toggleAdminPanel]);

  if (screen === 'TITLE') {
    return (
      <div className="h-[100dvh] w-full overflow-hidden">
        <TitleScreen />
        <ErrorBoundary
          variant="panel"
          title="Admin Panel"
          resetKey={adminPanelOpen}
          onClose={() => setAdminPanelOpen(false)}
        >
          <AdminPanel />
        </ErrorBoundary>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] w-full overflow-hidden flex flex-col bg-[#080C12] text-slate-100">
      <TopHud />
      {(screen === 'HANGAR' || screen === 'SHOP') && <HangarScreen />}
      {screen === 'BATTLE' && (
        <ErrorBoundary
          variant="global"
          onReloadBattle={() => startBattle(battleSectorId)}
        >
          <BattleScreen />
        </ErrorBoundary>
      )}

      <ErrorBoundary
        variant="panel"
        title="Auto Tactics"
        resetKey={tacticsModalOpen}
        onClose={() => setTacticsModalOpen(false)}
        onReloadBattle={
          screen === 'BATTLE' ? () => startBattle(battleSectorId) : undefined
        }
      >
        <AutoTacticsModal />
      </ErrorBoundary>

      <ErrorBoundary
        variant="panel"
        title="Admin Panel"
        resetKey={adminPanelOpen}
        onClose={() => setAdminPanelOpen(false)}
        onReloadBattle={
          screen === 'BATTLE' ? () => startBattle(battleSectorId) : undefined
        }
      >
        <AdminPanel />
      </ErrorBoundary>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary variant="global">
      <AppShell />
    </ErrorBoundary>
  );
}
