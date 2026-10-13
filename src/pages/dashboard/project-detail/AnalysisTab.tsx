import type { Project } from '@/data/projects';
import { TabsContent } from '@/components/ui/tabs';
import { Link } from 'react-router-dom';
import type { CopyProtectionProps } from '@/hooks/useCopyProtection';


export function AnalysisTab({ project, analysisCopyProps, canEditMetadata }: { project: Project; analysisCopyProps: CopyProtectionProps; canEditMetadata: boolean }) {
  const AnalysisSection = ({ title, content }: { title: string; content?: string }) => {
    if (!content) return null;
    return (
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-primary mb-1">{title}</h4>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{content}</p>
      </div>
    );
  };
  return (
          <div
            {...analysisCopyProps}
            className={`glass-panel rounded-xl p-5 space-y-2 ${analysisCopyProps.className}`}
          >
            {!project.detailedAnalysis && !project.keyRisks && !project.fundingSources && !project.environmentalImpact && !project.politicalContext ? (
              <p className="text-sm text-muted-foreground">
                No analysis content yet.
                {canEditMetadata && (
                  <> <Link to={`/dashboard/projects/${project.id}/edit`} className="text-primary hover:underline">Add analysis →</Link></>
                )}
              </p>
            ) : (
              <>
                <AnalysisSection title="Detailed Analysis" content={project.detailedAnalysis} />
                <AnalysisSection title="Key Risks" content={project.keyRisks} />
                <AnalysisSection title="Funding Sources" content={project.fundingSources} />
                <AnalysisSection title="Environmental Impact" content={project.environmentalImpact} />
                <AnalysisSection title="Political Context" content={project.politicalContext} />
              </>
            )}
          </div>
        </TabsContent>
  );
}
