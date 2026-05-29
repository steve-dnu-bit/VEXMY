
-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'artist', 'assistant');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles RLS: all authenticated staff can see each other
CREATE POLICY "Staff can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- User roles RLS: only admins can manage, all can read
CREATE POLICY "Staff can view roles" ON public.user_roles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Bookings table
CREATE TABLE public.bookings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_name TEXT NOT NULL,
  client_phone TEXT,
  client_email TEXT,
  tattoo_style TEXT,
  tattoo_size TEXT,
  tattoo_placement TEXT,
  reference_image_url TEXT,
  notes TEXT,
  booking_type TEXT NOT NULL DEFAULT 'session' CHECK (booking_type IN ('consultation', 'session')),
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'completed', 'cancelled', 'no-show')),
  starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
  deposit_amount NUMERIC(10,2) DEFAULT 50.00,
  deposit_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

-- All staff can view all bookings (key requirement: see each other's schedules)
CREATE POLICY "Staff can view all bookings" ON public.bookings
  FOR SELECT TO authenticated USING (true);

-- Artists can manage their own bookings
CREATE POLICY "Artists can insert bookings" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = artist_id);

CREATE POLICY "Artists can update own bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (auth.uid() = artist_id);

-- Admins can manage all bookings
CREATE POLICY "Admins can manage all bookings" ON public.bookings
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Messages table for unified inbox
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'facebook', 'email', 'sms')),
  sender_name TEXT NOT NULL,
  sender_id TEXT,
  message_text TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'inbound' CHECK (direction IN ('inbound', 'outbound')),
  is_read BOOLEAN DEFAULT false,
  assigned_to UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all messages" ON public.messages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can insert messages" ON public.messages
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Staff can update messages" ON public.messages
  FOR UPDATE TO authenticated USING (true);

-- Stencils table for AI-generated stencils
CREATE TABLE public.stencils (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_image_url TEXT NOT NULL,
  stencil_image_url TEXT,
  prompt TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stencils ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view all stencils" ON public.stencils
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create stencils" ON public.stencils
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update own stencils" ON public.stencils
  FOR UPDATE TO authenticated USING (auth.uid() = created_by);

-- Enable realtime for bookings and messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_bookings_updated_at BEFORE UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for reference images and stencils
INSERT INTO storage.buckets (id, name, public) VALUES ('uploads', 'uploads', true);

CREATE POLICY "Authenticated users can upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'uploads');

CREATE POLICY "Anyone can view uploads" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');
