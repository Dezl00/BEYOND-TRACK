ALTER TABLE purchase_requests DROP CONSTRAINT status_range;
ALTER TABLE purchase_requests ADD CONSTRAINT status_range CHECK(status BETWEEN 0 AND 9);
CREATE INDEX notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
--> statement-breakpoint
INSERT INTO permissions(key,label)
SELECT module||'.'||action, title||' · '||label
FROM (VALUES ('technical','المكتب الفني'),('finance','المالية')) AS m(module,title)
CROSS JOIN (VALUES ('view','عرض'),('create','إنشاء'),('edit','تعديل'),('delete','حذف'),('approve','اعتماد'),('export','تصدير')) AS a(action,label)
ON CONFLICT(key) DO NOTHING;
INSERT INTO roles(name,system) VALUES ('المكتب الفني',true),('المالية',true) ON CONFLICT(name) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON p.key IN('projects.view','projects.all','requests.view','requests.view_all','requests.export')
WHERE r.name IN('المكتب الفني','المالية') AND r.system=true ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p ON
  (r.name='المكتب الفني' AND p.key IN('technical.view','technical.approve','technical.export','boq.view','requests.approve')) OR
  (r.name='المالية' AND p.key IN('finance.view','finance.approve','finance.export')) OR
  (r.name='مشرف أعلى' AND (p.key LIKE 'technical.%' OR p.key LIKE 'finance.%'))
WHERE r.system=true ON CONFLICT DO NOTHING;
DELETE FROM role_permissions WHERE role_id IN(SELECT id FROM roles WHERE name='مسؤول المشتريات' AND system=true)
AND permission_id IN(SELECT id FROM permissions WHERE key LIKE 'boq.%');
