-- Seed: Terra asset type catalogue (task 0.5, FR-AST-01, FR-AST-02).
-- attribute_schema is JSON Schema for asset.attributes; the asset form renders from it (task 1.4).
insert into asset_type (organisation_id, asset_class, code, name, icon, attribute_schema)
select o.id, t.cls::asset_class, t.code, t.name, t.icon, t.schema::jsonb
from organisation o,
     (values
  ('living', 'TREE', 'Tree', 'tree', '{
     "type": "object",
     "properties": {
       "height_m": {"type": "number", "minimum": 0, "title": "Height (m)"},
       "dbh_cm": {"type": "number", "minimum": 0, "title": "Trunk diameter at 1.3 m (cm)"},
       "canopy_diameter_m": {"type": "number", "minimum": 0, "title": "Canopy diameter (m)"},
       "multi_stem": {"type": "boolean", "title": "Multi-stem"}
     }}'),
  ('living', 'PLANT', 'Plant (shrub, perennial, succulent)', 'plant', '{
     "type": "object",
     "properties": {
       "height_m": {"type": "number", "minimum": 0, "title": "Height (m)"},
       "spread_m": {"type": "number", "minimum": 0, "title": "Spread (m)"},
       "growth_form": {"type": "string", "enum": ["shrub", "perennial", "succulent", "climber", "grass", "annual"], "title": "Growth form"}
     }}'),
  ('living', 'GROUP', 'Planting group', 'group', '{
     "type": "object",
     "properties": {
       "cover_percent": {"type": "number", "minimum": 0, "maximum": 100, "title": "Cover (%)"},
       "spacing_m": {"type": "number", "minimum": 0, "title": "Spacing (m)"}
     }}'),
  ('built', 'VALVE', 'Irrigation valve', 'valve', '{
     "type": "object",
     "properties": {
       "size_mm": {"type": "number", "minimum": 0, "title": "Size (mm)"},
       "valve_type": {"type": "string", "enum": ["solenoid", "gate", "ball", "air_release", "pressure_reducing"], "title": "Valve type"},
       "controller_station": {"type": "string", "title": "Controller station"}
     }}'),
  ('built', 'PUMP', 'Pump', 'pump', '{
     "type": "object",
     "properties": {
       "power_kw": {"type": "number", "minimum": 0, "title": "Power (kW)"},
       "flow_l_min": {"type": "number", "minimum": 0, "title": "Rated flow (L/min)"},
       "manufacturer": {"type": "string", "title": "Manufacturer"},
       "model": {"type": "string", "title": "Model"},
       "serial": {"type": "string", "title": "Serial number"}
     }}'),
  ('built', 'CONTROLLER', 'Irrigation controller', 'controller', '{
     "type": "object",
     "properties": {
       "stations": {"type": "integer", "minimum": 1, "title": "Stations"},
       "manufacturer": {"type": "string", "title": "Manufacturer"},
       "model": {"type": "string", "title": "Model"},
       "serial": {"type": "string", "title": "Serial number"}
     }}'),
  ('built', 'BENCH', 'Bench', 'bench', '{
     "type": "object",
     "properties": {"material": {"type": "string", "enum": ["wood", "metal", "stone", "concrete", "composite"], "title": "Material"}}}'),
  ('built', 'SIGN', 'Sign or label', 'sign', '{
     "type": "object",
     "properties": {
       "sign_type": {"type": "string", "enum": ["species_label", "interpretive", "wayfinding", "safety"], "title": "Sign type"},
       "has_qr": {"type": "boolean", "title": "Has QR code"}
     }}'),
  ('built', 'BIN', 'Bin', 'bin', '{
     "type": "object",
     "properties": {"stream": {"type": "string", "enum": ["general", "recycling", "green_waste"], "title": "Waste stream"}}}'),
  ('built', 'CAMTRAP', 'Camera trap', 'camera', '{
     "type": "object",
     "properties": {
       "model": {"type": "string", "title": "Model"},
       "serial": {"type": "string", "title": "Serial number"},
       "height_m": {"type": "number", "minimum": 0, "title": "Mount height (m)"},
       "bearing_deg": {"type": "number", "minimum": 0, "maximum": 360, "title": "Bearing (degrees)"}
     }}'),
  ('built', 'SENSOR', 'Sensor', 'sensor', '{
     "type": "object",
     "properties": {
       "measures": {"type": "array", "items": {"type": "string", "enum": ["soil_moisture", "soil_temperature", "air_temperature", "humidity", "pressure", "flow", "water_level", "dissolved_oxygen"]}, "title": "Measures"},
       "model": {"type": "string", "title": "Model"},
       "serial": {"type": "string", "title": "Serial number"}
     }}'),
  ('built', 'AERATOR', 'Aerator', 'aerator', '{
     "type": "object",
     "properties": {"power_kw": {"type": "number", "minimum": 0, "title": "Power (kW)"}}}'),
  ('built', 'FOUNTAIN', 'Fountain or water feature', 'fountain', '{
     "type": "object",
     "properties": {"pump_power_kw": {"type": "number", "minimum": 0, "title": "Pump power (kW)"}}}'),
  ('built', 'FENCE', 'Fence', 'fence', '{
     "type": "object",
     "properties": {
       "material": {"type": "string", "title": "Material"},
       "height_m": {"type": "number", "minimum": 0, "title": "Height (m)"}
     }}'),
  ('built', 'OTHER', 'Other built asset', 'other', '{"type": "object", "properties": {}}')
     ) t(cls, code, name, icon, schema)
where o.slug = 'terra';
