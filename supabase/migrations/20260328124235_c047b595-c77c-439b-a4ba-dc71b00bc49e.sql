
-- Create a table for pending role assignments
CREATE TABLE IF NOT EXISTS public.pending_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role app_role NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pending_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pending roles"
ON public.pending_role_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Insert pending assignments
INSERT INTO public.pending_role_assignments (email, role) VALUES
  ('kinlotangiri911@gmail.com', 'admin'),
  ('ketacademy1@gmail.com', 'user');

-- Update handle_new_user to check pending assignments
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id) VALUES (NEW.id);
  
  -- Check for pending role assignment
  SELECT role INTO assigned_role FROM public.pending_role_assignments WHERE email = NEW.email;
  
  IF assigned_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
    DELETE FROM public.pending_role_assignments WHERE email = NEW.email;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  END IF;
  
  RETURN NEW;
END;
$$;
