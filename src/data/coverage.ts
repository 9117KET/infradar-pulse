/**
 * Coverage pillars: marketing groupings mapped to one or more project_sector enum values.
 * Additive only; legacy sectors remain valid on existing rows.
 */
import type { Sector } from '@/data/projects';
import type { LucideIcon } from 'lucide-react';
import {
  Battery,
  Building2,
  Cpu,
  Droplets,
  Factory,
  Fuel,
  Hexagon,
  Landmark,
  Mountain,
  Server,
  Waves,
} from 'lucide-react';

export type CoveragePillarId =
  | 'infrastructure'
  | 'building-construction'
  | 'energy'
  | 'industrial'
  | 'water'
  | 'chemical'
  | 'oil-gas'
  | 'mining'
  | 'data-centers'
  | 'ai-infrastructure';

export interface CoveragePillar {
  id: CoveragePillarId;
  title: string;
  description: string;
  icon: LucideIcon;
  /** project_sector values that belong to this pillar for filters and deep links */
  sectors: Sector[];
}

export const COVERAGE_PILLARS: CoveragePillar[] = [
  {
    id: 'infrastructure',
    title: 'Infrastructure projects',
    description: 'Roads, rail, airports, seaports, dryports',
    icon: Landmark,
    sectors: ['Infrastructure', 'Transport'],
  },
  {
    id: 'building-construction',
    title: 'Building construction projects',
    description: 'Residential, commercial, mixed-use',
    icon: Building2,
    sectors: ['Building Construction', 'Urban Development'],
  },
  {
    id: 'energy',
    title: 'Energy projects',
    description: 'Power generation, transmission, storage',
    icon: Battery,
    sectors: ['Energy', 'Renewable Energy'],
  },
  {
    id: 'industrial',
    title: 'Industrial projects',
    description: 'Cement, metals, others',
    icon: Factory,
    sectors: ['Industrial'],
  },
  {
    id: 'water',
    title: 'Water projects',
    description: 'Production, treatment, transmission, storage',
    icon: Waves,
    sectors: ['Water'],
  },
  {
    id: 'chemical',
    title: 'Chemical projects',
    description: 'Petrochemicals, basic chemicals, fertilizers',
    icon: Hexagon,
    sectors: ['Chemical'],
  },
  {
    id: 'oil-gas',
    title: 'Oil & gas projects',
    description: 'Upstream, midstream, downstream',
    icon: Fuel,
    sectors: ['Oil & Gas'],
  },
  {
    id: 'mining',
    title: 'Mining projects',
    description: 'Copper, iron, gold, lithium',
    icon: Mountain,
    sectors: ['Mining'],
  },
  {
    id: 'data-centers',
    title: 'Data centers',
    description: 'Hyperscale, colocation, campus power and cooling for compute',
    icon: Server,
    sectors: ['Data Centers'],
  },
  {
    id: 'ai-infrastructure',
    title: 'AI-related projects',
    description: 'GPU clusters, inference, training, LLM factories, sovereign AI buildout',
    icon: Cpu,
    sectors: ['AI Infrastructure', 'Digital Infrastructure'],
  },
];

export function sectorsForPillar(pillarId: CoveragePillarId): Sector[] {
  const p = COVERAGE_PILLARS.find((x) => x.id === pillarId);
  return p ? [...p.sectors] : [];
}

/** First pillar whose sector list includes this sector (order matters for overlapping pillars). */
export function pillarForSector(sector: Sector): CoveragePillar | undefined {
  for (const p of COVERAGE_PILLARS) {
    if (p.sectors.includes(sector)) return p;
  }
  return undefined;
}

export function pillarIdForSector(sector: Sector): CoveragePillarId | undefined {
  return pillarForSector(sector)?.id;
}

export function isCoveragePillarId(id: string): id is CoveragePillarId {
  return COVERAGE_PILLARS.some((p) => p.id === id);
}
