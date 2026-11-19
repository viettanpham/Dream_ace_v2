import type { CombatSide, MechClassId } from '../types/game';

interface MechSvgProps {
  classId: MechClassId;
  side?: CombatSide;
  facing?: 'right' | 'left';
  size?: 'sm' | 'md' | 'lg';
  destroyed?: boolean;
  defending?: boolean;
  className?: string;
}

const PALETTES: Record<
  CombatSide,
  {
    armorDark: string;
    armorMid: string;
    armorLight: string;
    frame: string;
    visor: string;
    core: string;
    trim: string;
  }
> = {
  ally: {
    armorDark: '#1E293B',
    armorMid: '#334155',
    armorLight: '#64748B',
    frame: '#0F172A',
    visor: '#38BDF8',
    core: '#F59E0B',
    trim: '#94A3B8',
  },
  enemy: {
    armorDark: '#26181E',
    armorMid: '#45222C',
    armorLight: '#7C3644',
    frame: '#140C10',
    visor: '#EF4444',
    core: '#F97316',
    trim: '#A85564',
  },
};

const SIZE_CLASSES = {
  sm: 'w-14 h-14',
  md: 'w-20 h-20',
  lg: 'w-56 h-56 sm:w-64 sm:h-64',
};

export function MechSvg({
  classId,
  side = 'ally',
  facing = 'right',
  size = 'md',
  destroyed = false,
  defending = false,
  className = '',
}: MechSvgProps) {
  const p = PALETTES[side];
  const flipTransform = facing === 'left' ? 'scale(-1, 1) translate(-120, 0)' : undefined;

  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${SIZE_CLASSES[size]} select-none ${
        destroyed ? 'opacity-30 grayscale' : ''
      } ${className}`}
      aria-hidden="true"
    >
      {/* Subtle floor shadow */}
      <ellipse cx="60" cy="108" rx="34" ry="5" fill="#020617" opacity="0.65" />

      {/* Defensive energy field */}
      {defending && !destroyed && (
        <g>
          <polygon
            points="60,8 106,34 106,86 60,112 14,86 14,34"
            stroke="#38BDF8"
            strokeWidth="1.5"
            strokeDasharray="6 4"
            fill="#38BDF8"
            fillOpacity="0.08"
          />
        </g>
      )}

      <g transform={flipTransform}>
        {classId === 'striker' && (
          <g>
            {/* Back booster vents */}
            <path d="M36 36 L22 26 L20 44 L34 50 Z" fill={p.frame} stroke={p.trim} strokeWidth="1.2" />
            <rect x="21" y="31" width="5" height="9" fill={p.core} opacity={destroyed ? 0.15 : 0.85} />
            {/* Legs */}
            <path d="M44 70 L36 102 L48 104 L54 74 Z" fill={p.armorDark} stroke={p.trim} strokeWidth="1.2" />
            <path d="M64 70 L72 102 L84 104 L74 70 Z" fill={p.armorMid} stroke={p.trim} strokeWidth="1.2" />
            <rect x="33" y="100" width="18" height="5" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1" />
            <rect x="69" y="100" width="19" height="5" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1" />
            {/* Pelvis & Torso */}
            <polygon points="44,64 76,64 72,76 48,76" fill={p.frame} stroke={p.trim} strokeWidth="1.2" />
            <polygon points="38,34 80,34 74,66 44,66" fill={p.armorMid} stroke={p.trim} strokeWidth="1.4" />
            <polygon points="46,40 72,40 68,58 50,58" fill={p.armorDark} stroke={p.armorLight} strokeWidth="1" />
            {/* Reactor Core */}
            <polygon points="56,45 64,45 62,53 58,53" fill={p.core} opacity={destroyed ? 0.15 : 1} />
            {/* Head */}
            <polygon points="49,21 71,21 74,34 46,34" fill={p.armorLight} stroke={p.trim} strokeWidth="1.2" />
            <rect x="56" y="25" width="15" height="4" rx="1" fill={p.visor} opacity={destroyed ? 0.2 : 1} />
            <line x1="52" y1="21" x2="46" y2="12" stroke={p.trim} strokeWidth="1.5" />
            {/* Shoulder Pauldron */}
            <polygon points="32,32 48,30 46,48 30,45" fill={p.armorLight} stroke={p.trim} strokeWidth="1.3" />
            {/* Rifle Arm */}
            <path d="M72 40 L92 48 L90 56 L70 50 Z" fill={p.armorDark} stroke={p.trim} strokeWidth="1.2" />
            {/* Twin-barrel pulse rifle */}
            <rect x="74" y="47" width="38" height="7" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1.2" />
            <rect x="104" y="45" width="10" height="3" fill={p.armorLight} />
            <rect x="104" y="51" width="12" height="3" fill={p.visor} opacity={destroyed ? 0.2 : 0.9} />
            {/* Left arm */}
            <path d="M35 46 L28 66 L36 68 L44 50 Z" fill={p.armorMid} stroke={p.trim} strokeWidth="1.2" />
          </g>
        )}

        {classId === 'interceptor' && (
          <g>
            {/* Swept Aero Wings */}
            <polygon points="44,40 12,18 18,34 40,50" fill={p.armorDark} stroke={p.visor} strokeWidth="1.2" />
            <polygon points="40,48 16,42 22,54 42,58" fill={p.armorMid} stroke={p.trim} strokeWidth="1.1" />
            {/* Agile Reverse-Joint Legs */}
            <path d="M46 68 L36 86 L44 103 L52 103 L48 86 L55 70 Z" fill={p.armorDark} stroke={p.trim} strokeWidth="1.2" />
            <path d="M62 68 L74 84 L70 103 L79 103 L84 82 L71 68 Z" fill={p.armorMid} stroke={p.trim} strokeWidth="1.2" />
            {/* Slim Torso */}
            <polygon points="45,35 74,38 68,69 47,69" fill={p.armorMid} stroke={p.trim} strokeWidth="1.3" />
            <polygon points="52,42 68,44 64,59 53,58" fill={p.armorDark} stroke={p.visor} strokeWidth="1" />
            <circle cx="61" cy="50" r="3" fill={p.visor} opacity={destroyed ? 0.2 : 1} />
            {/* Sleek Aero Head */}
            <polygon points="46,24 76,26 68,36 48,35" fill={p.armorLight} stroke={p.trim} strokeWidth="1.2" />
            <polygon points="58,27 74,28 70,32 58,31" fill={p.visor} opacity={destroyed ? 0.2 : 1} />
            {/* Forward Strike Blades / Carbines */}
            <path d="M70 44 L96 42 L114 46 L94 52 L68 52 Z" fill={p.frame} stroke={p.trim} strokeWidth="1.2" />
            <line x1="92" y1="46" x2="113" y2="46" stroke={p.visor} strokeWidth="2" opacity={destroyed ? 0.2 : 0.95} />
            <path d="M42 46 L30 62 L52 66 L54 59 L40 58 L48 48 Z" fill={p.armorLight} stroke={p.trim} strokeWidth="1.1" />
          </g>
        )}

        {classId === 'siege' && (
          <g>
            {/* Heavy Shoulder Railcannon */}
            <rect x="26" y="16" width="66" height="14" rx="2" fill={p.frame} stroke={p.trim} strokeWidth="1.4" />
            <rect x="86" y="18" width="24" height="4" fill={p.armorLight} />
            <rect x="86" y="24" width="20" height="4" fill={p.core} opacity={destroyed ? 0.2 : 0.95} />
            <rect x="34" y="19" width="28" height="8" fill={p.armorMid} />
            {/* Heavy Stabilizer Legs */}
            <polygon points="34,72 26,104 48,104 52,72" fill={p.armorDark} stroke={p.trim} strokeWidth="1.4" />
            <polygon points="66,72 70,104 92,104 84,72" fill={p.armorMid} stroke={p.trim} strokeWidth="1.4" />
            <rect x="22" y="100" width="28" height="6" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1.2" />
            <rect x="68" y="100" width="28" height="6" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1.2" />
            {/* Massive Dreadnought Torso */}
            <polygon points="28,34 88,34 84,74 32,74" fill={p.armorMid} stroke={p.trim} strokeWidth="1.5" />
            <polygon points="38,42 78,42 75,66 41,66" fill={p.armorDark} stroke={p.armorLight} strokeWidth="1.2" />
            {/* Armored Cockpit Visor */}
            <rect x="48" y="30" width="24" height="10" rx="1" fill={p.armorLight} stroke={p.trim} strokeWidth="1.2" />
            <rect x="54" y="33" width="16" height="4" fill={p.visor} opacity={destroyed ? 0.2 : 1} />
            {/* Chest Core Vent */}
            <rect x="52" y="49" width="16" height="9" rx="1" fill={p.frame} stroke={p.core} strokeWidth="1.2" />
            <rect x="55" y="52" width="10" height="3" fill={p.core} opacity={destroyed ? 0.15 : 1} />
            {/* Heavy Cannon Arm */}
            <rect x="82" y="44" width="26" height="14" rx="2" fill={p.armorDark} stroke={p.trim} strokeWidth="1.3" />
            <rect x="104" y="47" width="10" height="8" fill={p.armorLight} />
            {/* Heavy Shield Arm */}
            <polygon points="20,42 32,42 30,72 18,68" fill={p.armorLight} stroke={p.trim} strokeWidth="1.3" />
          </g>
        )}

        {classId === 'support' && (
          <g>
            {/* Dorsal Shield Emitter Array / Halo Dish */}
            <path d="M36 32 L22 16 L32 14 L46 30 Z" fill={p.armorDark} stroke={p.trim} strokeWidth="1.2" />
            <circle cx="26" cy="20" r="8" stroke={p.visor} strokeWidth="1.6" fill={p.frame} />
            <circle cx="26" cy="20" r="3" fill={p.visor} opacity={destroyed ? 0.2 : 1} />
            {/* Sensor Mast */}
            <line x1="68" y1="22" x2="76" y2="10" stroke={p.trim} strokeWidth="1.5" />
            <circle cx="76" cy="10" r="2.2" fill={p.core} opacity={destroyed ? 0.2 : 1} />
            {/* Balanced Tactical Legs */}
            <path d="M44 70 L39 102 L50 103 L55 72 Z" fill={p.armorDark} stroke={p.trim} strokeWidth="1.2" />
            <path d="M64 70 L69 102 L80 103 L74 70 Z" fill={p.armorMid} stroke={p.trim} strokeWidth="1.2" />
            <rect x="36" y="100" width="17" height="5" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1" />
            <rect x="67" y="100" width="17" height="5" rx="1" fill={p.frame} stroke={p.trim} strokeWidth="1" />
            {/* Command Chassis Torso */}
            <polygon points="40,34 78,34 74,70 44,70" fill={p.armorMid} stroke={p.trim} strokeWidth="1.3" />
            {/* Hex Energy Projector Core */}
            <polygon points="59,43 68,48 68,58 59,63 50,58 50,48" fill={p.frame} stroke={p.visor} strokeWidth="1.4" />
            <polygon points="59,47 64,50 64,56 59,59 54,56 54,50" fill={p.visor} opacity={destroyed ? 0.18 : 0.95} />
            {/* Head */}
            <polygon points="48,22 70,22 72,34 46,34" fill={p.armorLight} stroke={p.trim} strokeWidth="1.2" />
            <rect x="52" y="26" width="16" height="4" rx="1" fill={p.visor} opacity={destroyed ? 0.2 : 1} />
            {/* Shield Projector Arm */}
            <path d="M76 42 L94 46 L94 56 L74 54 Z" fill={p.armorDark} stroke={p.trim} strokeWidth="1.2" />
            <polygon
              points="96,36 106,42 106,62 96,68 90,62 90,42"
              fill={p.visor}
              fillOpacity={destroyed ? 0.08 : 0.22}
              stroke={p.visor}
              strokeWidth="1.5"
            />
            {/* Support Left Arm */}
            <path d="M40 42 L29 58 L36 63 L45 48 Z" fill={p.armorMid} stroke={p.trim} strokeWidth="1.2" />
          </g>
        )}
      </g>
    </svg>
  );
}
