-- Telegram chat metadata on channel_bindings (title, chat_type).

alter table channel_bindings add column if not exists title text;
alter table channel_bindings add column if not exists chat_type text;
