ALTER TABLE purchase_requests DROP CONSTRAINT status_range;
ALTER TABLE purchase_requests ADD CONSTRAINT status_range CHECK(status BETWEEN 0 AND 15);
ALTER TABLE request_lines ADD CONSTRAINT technical_review_values CHECK(review_status IN(0,1,2) AND (review_status<>2 OR length(trim(review_note))>0));
ALTER TABLE attachments ADD CONSTRAINT attachment_purpose CHECK(purpose IN('request','receipt','quotation','alternative','payment'));
ALTER TABLE attachments ADD CONSTRAINT attachment_delivery_type CHECK(delivery_type IN('upload','authenticated'));
UPDATE attachments SET purpose='receipt' WHERE receipt_key IS NOT NULL OR receipt_id IS NOT NULL;
CREATE INDEX attachments_upload_batch ON attachments(request_id,upload_key);
CREATE UNIQUE INDEX roles_workflow_key ON roles(workflow_role) WHERE workflow_role IS NOT NULL;
--> statement-breakpoint
INSERT INTO permissions(key,label)
SELECT module||'.'||action,title||' · '||label
FROM (VALUES ('construction','مدير الإنشاءات'),('project_management','مدير المشاريع'),('accounts','الحسابات')) m(module,title)
CROSS JOIN (VALUES ('view','عرض'),('approve','اعتماد'),('export','تصدير')) a(action,label)
ON CONFLICT(key) DO NOTHING;
UPDATE roles SET name='مدير الحسابات' WHERE name='المالية' AND system AND NOT EXISTS(SELECT 1 FROM roles WHERE name='مدير الحسابات');
UPDATE permissions SET label=replace(label,'المالية','مدير الحسابات') WHERE key LIKE 'finance.%';
INSERT INTO roles(name,system,workflow_role) VALUES
('مدير الإنشاءات',true,'construction'),('مدير المشاريع',true,'project_management'),('الحسابات',true,'accounts')
ON CONFLICT(name) DO UPDATE SET workflow_role=EXCLUDED.workflow_role;
INSERT INTO permissions(key,label) VALUES ('projects.view','المشاريع · عرض'),('projects.all','كل المشاريع'),('boq.view','البنود · عرض'),('requests.view','الطلبات · عرض'),('requests.view_all','عرض جميع الطلبات'),('requests.export','الطلبات · تصدير') ON CONFLICT(key) DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p
ON p.key IN('projects.view','projects.all','boq.view','requests.view','requests.view_all','requests.export')
OR p.key IN(r.workflow_role||'.view',r.workflow_role||'.approve',r.workflow_role||'.export')
WHERE r.workflow_role IN('construction','project_management','accounts') ON CONFLICT DO NOTHING;
DELETE FROM role_permissions WHERE permission_id IN(SELECT id FROM permissions WHERE key='requests.approve')
AND role_id NOT IN(SELECT id FROM roles WHERE workflow_role='construction');
--> statement-breakpoint
CREATE FUNCTION protect_technical_review() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=15 AND OLD.status=1 AND EXISTS(SELECT 1 FROM request_lines WHERE request_id=NEW.id AND review_status<>1) THEN
    RAISE EXCEPTION 'All lines require technical approval' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER technical_review_transition BEFORE UPDATE ON purchase_requests FOR EACH ROW EXECUTE FUNCTION protect_technical_review();

--> statement-breakpoint
-- Start pending first reviews with construction; retain completed historical approvals.
UPDATE request_lines l SET overage_approved_by=NULL,overage_approved_at=NULL
FROM purchase_requests r, users u
WHERE l.request_id=r.id AND r.status=1 AND l.overage_approved_by=u.id AND NOT u.is_owner;
WITH transferred AS (
  UPDATE purchase_requests SET status=12,version=version+1,updated_at=now() WHERE status=1 RETURNING id
)
INSERT INTO request_timeline(request_id,user_id,from_status,to_status,note)
SELECT id,NULL,1,12,'أُحيل الطلب إلى مدير الإنشاءات عند تحديث مراحل الاعتماد.' FROM transferred;

-- Pending pre-pricing financial reviews now belong to the project manager.
WITH transferred AS (
  UPDATE purchase_requests SET status=15,version=version+1,updated_at=now() WHERE status=9 RETURNING id
)
INSERT INTO request_timeline(request_id,user_id,from_status,to_status,note)
SELECT id,NULL,9,15,'نُقل الطلب إلى مدير المشاريع عند تحديث مراحل الاعتماد.' FROM transferred;

-- On a fresh installation the earlier approval migration runs before the base permissions are seeded.
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r JOIN permissions p
ON p.key IN('projects.view','projects.all','requests.view','requests.view_all','requests.export')
OR (r.name='المكتب الفني' AND p.key='boq.view')
WHERE r.system AND r.name IN('المكتب الفني','مدير الحسابات') ON CONFLICT DO NOTHING;
