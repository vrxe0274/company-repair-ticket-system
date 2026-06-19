-- Generic key/value store for app-level settings (terms, etc.)
create table if not exists app_settings (
  key   text primary key,
  value jsonb not null
);

alter table app_settings enable row level security;

create policy "Public read app_settings"
  on app_settings for select using (true);

create policy "Public write app_settings"
  on app_settings for insert with check (true);

create policy "Public update app_settings"
  on app_settings for update using (true);

create policy "Public delete app_settings"
  on app_settings for delete using (true);
