-- Seed: organisation Terra and its teams (task 0.5).
insert into organisation (name, slug, settings) values (
  'Terra, Expo City Dubai', 'terra',
  '{
    "timezone": "Asia/Dubai",
    "locale": "en",
    "locales": ["en", "ar"],
    "work_week": {"mon": ["07:00", "15:00"], "tue": ["07:00", "15:00"], "wed": ["07:00", "15:00"],
                  "thu": ["07:00", "15:00"], "fri": ["07:00", "15:00"], "sat": ["07:00", "11:00"]}
  }'
);

insert into team (organisation_id, name, discipline)
select o.id, t.name, t.discipline
from organisation o,
     (values ('Green Team East', 'living'),
             ('Green Team West', 'living'),
             ('Irrigation', 'built')) t(name, discipline)
where o.slug = 'terra';
