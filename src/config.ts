// Both values are PUBLIC: they end up inside the web page. They are safe only because the database access rules
// in supabase/schema.sql are in place. Never use the service_role / secret key here.
// Set them in .env.local (local runs) or as GitHub repository variables (deployed build); see README.md.
// Leave them empty and the app runs in "local only" mode.
export const config = {
  supabaseUrl: (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '',
  supabaseKey: (import.meta.env.VITE_SUPABASE_KEY as string | undefined) ?? '',
};
