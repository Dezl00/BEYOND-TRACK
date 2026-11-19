-- Use the receiver's project and workflow visibility for peer requests.
INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.system AND r.name = 'مهندس موقع'
  AND p.key IN ('requests.view_all', 'receipts.view', 'receipts.create')
ON CONFLICT DO NOTHING;
