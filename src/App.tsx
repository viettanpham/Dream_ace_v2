import { BattleScreen } from './components/BattleScreen';
import { HangarScreen } from './components/HangarScreen';
import { TitleScreen } from './components/TitleScreen';
import { TopHud } from './components/TopHud';
import { useGameStore } from './store/useGameStore';

export default function App() {
  const screen = useGameStore((s) => s.screen);

  if (screen === 'TITLE') {
    return (
      <div className="h-screen w-screen overflow-hidden">
        <TitleScreen />
      </div>
    );
  }

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#080C12] text-slate-100">
      <TopHud />
      {(screen === 'HANGAR' || screen === 'SHOP') && <HangarScreen />}
      {screen === 'BATTLE' && <BattleScreen />}
    </div>
  );
}
