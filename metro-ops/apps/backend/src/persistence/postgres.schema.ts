export const POSTGRES_SCHEMA_SQL = `
create table if not exists trip (
  id text primary key,
  train_no text not null,
  route_id text not null,
  direction text not null,
  origin_station_id text not null,
  terminal_station_id text not null,
  schedule_version_id text not null,
  planned_departure_at timestamptz not null,
  planned_arrival_at timestamptz not null,
  actual_departure_at timestamptz,
  actual_arrival_at timestamptz,
  assigned_operator_ids jsonb not null default '[]'::jsonb,
  assigned_vehicle_id text,
  station_times jsonb not null default '[]'::jsonb,
  status text not null,
  updated_at timestamptz not null default now()
);

alter table trip add column if not exists station_times jsonb not null default '[]'::jsonb;

create table if not exists trip_events (
  id text primary key,
  trip_id text not null references trip(id) on delete cascade,
  kind text not null,
  from_status text not null,
  to_status text not null,
  source text not null,
  actor_operator_id text,
  occurred_at timestamptz not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

create table if not exists import_jobs (
  id text primary key,
  source_type text not null,
  file_name text not null,
  status text not null,
  parser_name text not null default '',
  confidence jsonb,
  confidence_score numeric,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_by text not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  storage_key text not null
);

create table if not exists schedule_versions (
  schedule_version_id text primary key,
  schedule_version_name text,
  source_job_id text not null,
  source_file_name text not null,
  imported_at timestamptz not null,
  schedule_date date not null,
  accepted_sections jsonb not null
);

create table if not exists duties (
  id text primary key,
  schedule_version_id text not null references schedule_versions(schedule_version_id) on delete cascade,
  source_job_id text not null,
  imported_at timestamptz not null,
  operator_name text,
  train_no text,
  route_id text,
  duty_date date,
  notes text,
  data jsonb not null
);

create index if not exists trip_schedule_version_idx on trip(schedule_version_id);
create index if not exists trip_planned_departure_idx on trip(planned_departure_at);
create index if not exists trip_events_trip_id_idx on trip_events(trip_id);
create index if not exists duties_schedule_version_idx on duties(schedule_version_id);
create index if not exists duties_duty_date_idx on duties(duty_date);
`;
