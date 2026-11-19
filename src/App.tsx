import { useEffect } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { AutoTacticsModal } from './components/AutoTacticsModal';
import { BattleScreen } from './components/BattleScreen';
import { HangarScreen } from './components/HangarScreen';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { useGameStore } from './store/useGameStore';

export default function App() {
  const screen = useGameStore((s) => s.screen);
  const toggleAdminPanel = useGameStore((s) => s.toggleAdminPanel);
  const setAdminPanelOpen = useGameStore((s) => s.setAdminPanelOpen);

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
      <div className="h-screen w-screen overflow-hidden">
        <TitleScreen />
        <AdminPanel />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#080C12] text-slate-100">
      <TopHud />
      {(screen === 'HANGAR' || screen === 'SHOP') && <HangarScreen />}
      {screen === 'BATTLE' && <BattleScreen />}
      <AutoTacticsModal />
      <AdminPanel />
    </div>
  );
}
