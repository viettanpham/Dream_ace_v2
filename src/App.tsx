import { BattleScreen } from './components/BattleScreen';
import { HangarScreen } from './components/HangarScreen';
import { ShopScreen } from './components/ShopScreen';
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
      {screen === 'HANGAR' && <HangarScreen />}
      {screen === 'SHOP' && <ShopScreen />}
      {screen === 'BATTLE' && <BattleScreen />}
    </div>
  );
}
