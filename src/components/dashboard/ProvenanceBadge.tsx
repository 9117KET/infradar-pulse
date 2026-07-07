import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Landmark, UserCheck, Bot } from 'lucide-react';
import type { Project } from '@/data/projects';

const PROVENANCE_META: Record<
  NonNullable<Project['provenance']>,
  { label: string; icon: typeof Landmark; className: string; tooltip: string }
> = {
  official_registry: {
    label: 'Official registry',
    icon: Landmark,
    className: 'border-sky-500/40 text-sky-400',
    tooltip: 'Ingested directly from an official source (World Bank, IFC, ADB, IADB, AIIB, …) with a verifiable source link.',
  },
  human_verified: {
    label: 'Human-verified',
    icon: UserCheck,
    className: 'border-emerald-500/40 text-emerald-400',
    tooltip: 'Reviewed and approved by an InfraRadar researcher in the verification workbench.',
  },
  ai_agent: {
    label: 'AI-researched',
    icon: Bot,
    className: 'border-amber-500/40 text-amber-400',
    tooltip: 'Discovered by an AI research agent. Pending human verification.',
  },
};

/** Shows where a published project record came from. Renders nothing for legacy rows without provenance. */
export function ProvenanceBadge({ provenance, size = 'sm' }: { provenance?: Project['provenance']; size?: 'sm' | 'xs' }) {
  if (!provenance) return null;
  const meta = PROVENANCE_META[provenance];
  if (!meta) return null;
  const Icon = meta.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className={`${size === 'xs' ? 'text-[9px]' : 'text-[10px]'} gap-1 ${meta.className}`}>
          <Icon className={size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
          {meta.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] text-xs">{meta.tooltip}</TooltipContent>
    </Tooltip>
  );
}
