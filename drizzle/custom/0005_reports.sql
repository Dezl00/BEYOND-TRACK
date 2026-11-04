INSERT INTO permissions(key,label) VALUES
  ('reports.view','تقارير المشروع · عرض'),
  ('reports.export','تقارير المشروع · تصدير وطباعة')
ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE r.system=true AND r.name='مشرف أعلى' AND p.key IN('reports.view','reports.export')
ON CONFLICT DO NOTHING;
