UPDATE public.research_tasks SET task_type = 'insight-sources' WHERE task_type = 'insight_sources';
SELECT public.rebuild_agent_config_from_tasks();