CREATE TABLE mobile_submissions (
  user_id uuid NOT NULL,
  submission_id uuid NOT NULL,
  request_id uuid NOT NULL,
  payload_hash text NOT NULL,
  PRIMARY KEY(user_id, submission_id)
);
