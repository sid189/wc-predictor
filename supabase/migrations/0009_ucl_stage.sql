-- Add a UCL stage so club fixtures can flow through the existing
-- prediction/scoring engine (ET + penalty predictions enabled, since
-- is_knockout is true for any non-group stage).

alter type match_stage add value if not exists 'ucl';
