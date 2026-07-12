-- Seed the first Engineering Blog post (Week 1) — authored content, published.
INSERT INTO blog_posts (slug, date, title, intro, explanation, image_url, hd_image_url, media_type, category, video_url, published)
VALUES (
  '2026-07-12-week-1-engineering-challenges-behind-objecttracer',
  '2026-07-12',
  'Week 1 — Engineering Challenges Behind ObjectTracer',
  'One of the biggest challenges in ObjectTracer was rendering 40,000+ live aircraft on a 3D globe while maintaining 60 FPS, even on mobile devices.',
  E'The problem:\n1. Naively creating one Three.js Mesh per aircraft means 40,000+ draw calls every frame.\n2. That''s also 40,000+ scene graph objects being updated every frame.\n3. The CPU becomes the bottleneck long before the GPU is fully utilized, making the experience unusable on most devices.\n\nThe solution:\n1. Switched to GPU instancing using InstancedMesh.\n2. Each aircraft category (planes, widebodies, helicopters, ships, satellites, etc.) is rendered with a single instanced mesh.\n3. The geometry is uploaded to the GPU only once, while every aircraft stores only its transform matrix and color.\n4. Reduced rendering from 40,000+ draw calls to just a handful — roughly one per object category.\n\nOptimisations that made it practical:\n1. Every aircraft has a permanent slot, so live WebSocket updates only modify the affected instance without rebuilding or reallocating buffers.\n2. Dynamic screen-space scaling keeps aircraft readable at every zoom level while preserving realistic sizing when you''re close to the ground.\n3. Selecting an aircraft updates only the colors of the previously selected and newly selected instances instead of synchronising all 40,000+ objects.\n\nThis is one of those engineering problems users never notice when it''s solved, but they immediately notice when it isn''t.\n\nNext week: how do you make 40,000+ aircraft individually clickable when they''re all rendered as just a handful of GPU draw calls?',
  '', '', 'image', 'engineering', '', TRUE
)
ON CONFLICT (slug) DO NOTHING;
