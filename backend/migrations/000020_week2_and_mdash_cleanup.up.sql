-- Remove em-dashes from the seeded Week 1 post (no em-dashes in blog content).
UPDATE blog_posts SET
  title = 'Week 1: Engineering Challenges Behind ObjectTracer',
  explanation = replace(replace(explanation, E' — ', ', '), E'—', ',')
WHERE slug = '2026-07-12-week-1-engineering-challenges-behind-objecttracer';

-- Seed Week 2: GPU picking.
INSERT INTO blog_posts (slug, date, title, intro, explanation, image_url, hd_image_url, media_type, category, video_url, published)
VALUES (
  '2026-07-13-week-2-making-40-000-aircraft-clickable',
  '2026-07-13',
  'Week 2: Making 40,000 Aircraft Clickable',
  'Last week I explained how ObjectTracer renders 40,000+ live aircraft in a handful of GPU draw calls. That created a new problem: how do you click on ONE of them?',
  E'The problem:\n1. With instancing, the aircraft are not objects anymore. They are rows in a GPU buffer, and there is nothing to attach a click handler to.\n2. Raycasting against 40,000 instances on every click means intersecting thousands of triangles on the CPU. It is slow, and it misses constantly: a plane is about 15 pixels on screen, drawn at odd angles.\n3. On mobile it gets worse. Fingers are imprecise, and users expect a generous tap radius.\n\nThe solution, two pickers layered:\n1. GPU color picking. A hidden mirror scene renders every aircraft with a unique RGB color that encodes its ID. The color IS the identity. On click, we render that scene to an offscreen buffer and read a 7x7 pixel patch under the cursor. The nearest non-black pixel decodes back to the aircraft. Pixel-perfect, because the GPU already answered "what is under this pixel" by rasterizing.\n2. A screen-space spatial index as the fallback. Project every aircraft to screen coordinates, feed them into a k-d tree, and query a generous radius around the tap: 44px on touch, 20px with a mouse. It catches everything the pixel-perfect pass misses at far zoom.\n\nThe details that made it production-ready:\n1. The pick scene shares the same instance matrix buffers as the display scene. Zero copies, always in sync.\n2. Color ID zero is reserved for background, so empty clicks cost nothing.\n3. The spatial query is capped at one per frame. A 120Hz mouse should not out-vote the render loop.\n\nTwo systems, one invisible result: you tap a 15-pixel plane moving at 900 km/h, and it just selects.\n\nNext week: how we built the globe itself from scratch. Real map tiles on a sphere, day and night lighting, and why we did not use a mapping library at all.',
  '', '', 'image', 'engineering', '', TRUE
)
ON CONFLICT (slug) DO NOTHING;
