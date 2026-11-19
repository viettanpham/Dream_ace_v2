import { useGameStore } from '../store/useGameStore';
import { GearView } from './GearView';
import { MapView } from './MapView';
import { PilotView } from './PilotView';
import { ShopScreen } from './ShopScreen';
import { SidebarNav } from './SidebarNav';
import { SkillView } from './SkillView';

export function HangarScreen() {
  const activeTab = useGameStore((s) => s.activeTab);

  return (
    <div className="flex-1 min-h-0 flex flex-col md:flex-row bg-tactical-grid overflow-hidden">
      <SidebarNav />
      <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {activeTab === 'gear' && <GearView />}
        {activeTab === 'pilot' && <PilotView />}
        {activeTab === 'skill' && <SkillView />}
        {activeTab === 'shop' && <ShopScreen />}
        {activeTab === 'map' && <MapView />}
      </main>
    </div>
  );
}
