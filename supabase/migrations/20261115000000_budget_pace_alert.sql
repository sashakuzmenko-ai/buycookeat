-- Budget pace alert settings for households
alter table households
  add column pace_alert_enabled boolean not null default false,
  add column pace_alert_sent_on date;
