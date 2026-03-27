-- Allow authenticated users to update projects (for approve/reject)
CREATE POLICY "Auth users can update projects"
ON public.projects
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- Allow authenticated users to delete projects (for reject+delete)
CREATE POLICY "Auth users can delete projects"
ON public.projects
FOR DELETE
TO authenticated
USING (true);